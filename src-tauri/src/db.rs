use crate::{error::AppResult, models::Problem};
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::{fs, sync::Mutex};
use tauri::{AppHandle, Manager};

pub struct Db(pub Mutex<Connection>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompanyBookCatalog {
    source_commit: String,
    books: Vec<CompanyBookSeed>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompanyBookSeed {
    id: String,
    title: String,
    subtitle: String,
    description: String,
    accent: String,
    order_index: i32,
    problems: Vec<Problem>,
}

/// LeetCode's public problem list (scripts/catalog/fetch-leetcode-catalog.mjs).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeetCodeCatalog {
    fetched_at: String,
    problems: Vec<CatalogProblem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogProblem {
    id: String,
    number: i32,
    title: String,
    difficulty: String,
    category: String,
    paid_only: bool,
}

pub const GLOBAL_BOOK: &str = "leetcode-all";

pub fn initialize(app: &AppHandle) -> AppResult<Db> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::Message(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    let conn = Connection::open(dir.join("leetjournal.sqlite3"))?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")?;
    migrate(&conn)?;
    crate::offline::initialize(&conn)?;
    seed(&conn)?;
    Ok(Db(Mutex::new(conn)))
}

fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(r#"
      CREATE TABLE IF NOT EXISTS problems (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
        difficulty TEXT NOT NULL, leetcode_url TEXT NOT NULL, neetcode_url TEXT,
        order_index INTEGER NOT NULL, category_order INTEGER NOT NULL,
        is_curriculum INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id TEXT NOT NULL REFERENCES problems(id),
        started_at TEXT NOT NULL, paused_at TEXT, paused_seconds INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT, abandoned_at TEXT, duration_seconds INTEGER, outcome TEXT, confidence INTEGER,
        notes TEXT NOT NULL DEFAULT '', is_review INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS attempt_mistakes (
        attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        mistake_type TEXT NOT NULL, PRIMARY KEY(attempt_id, mistake_type)
      );
      CREATE TABLE IF NOT EXISTS reviews (
        problem_id TEXT PRIMARY KEY REFERENCES problems(id), next_review_date TEXT NOT NULL,
        review_level INTEGER NOT NULL DEFAULT 0, last_reviewed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS pattern_notes (
        category TEXT PRIMARY KEY, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_activity (
        date TEXT PRIMARY KEY, focused_seconds INTEGER NOT NULL DEFAULT 0,
        attempts_completed INTEGER NOT NULL DEFAULT 0, goal_completed INTEGER NOT NULL DEFAULT 0,
        xp_earned INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_plan (
        date TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('Warm-up','Main problem')),
        problem_id TEXT NOT NULL REFERENCES problems(id),
        PRIMARY KEY(date, kind)
      );
      CREATE TABLE IF NOT EXISTS problem_books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        accent TEXT NOT NULL DEFAULT 'sage',
        order_index INTEGER NOT NULL DEFAULT 0,
        built_in INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS problem_book_items (
        book_id TEXT NOT NULL REFERENCES problem_books(id) ON DELETE CASCADE,
        problem_id TEXT NOT NULL REFERENCES problems(id),
        order_index INTEGER NOT NULL,
        PRIMARY KEY(book_id, problem_id)
      );
      CREATE INDEX IF NOT EXISTS idx_attempts_problem ON attempts(problem_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(next_review_date);
    "#)?;
    let has_curriculum_flag = conn
        .prepare("PRAGMA table_info(problems)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|name| name == "is_curriculum");
    if !has_curriculum_flag {
        conn.execute(
            "ALTER TABLE problems ADD COLUMN is_curriculum INTEGER NOT NULL DEFAULT 1",
            [],
        )?;
    }
    let has_abandoned_at = conn
        .prepare("PRAGMA table_info(attempts)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|name| name == "abandoned_at");
    if !has_abandoned_at {
        conn.execute("ALTER TABLE attempts ADD COLUMN abandoned_at TEXT", [])?;
    }
    migrate_session_slots(conn)?;
    crate::study::migrate(conn)?;
    let defaults = [
        ("display_name", "Coder"),
        ("daily_focus_minutes", "30"),
        ("weekly_goal_days", "5"),
        ("focus_duration_minutes", "25"),
        ("hint_delay_minutes", "10"),
        ("progressive_hints", "true"),
        ("plant_animations", "true"),
        ("theme", "warm-garden"),
    ];
    for (key, value) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)",
            params![key, value],
        )?;
    }
    Ok(())
}

fn migrate_session_slots(conn: &Connection) -> AppResult<()> {
    // Preserve every attempt. If legacy duplicates exist, creation fails and
    // the transaction restores the old index instead of discarding sessions.
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(
        "DROP INDEX IF EXISTS idx_attempts_one_active;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_one_per_kind ON attempts(is_review)
        WHERE completed_at IS NULL AND abandoned_at IS NULL;",
    )?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
pub(crate) fn test_connection() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
    migrate(&conn).unwrap();
    crate::offline::initialize(&conn).unwrap();
    seed(&conn).unwrap();
    conn
}

fn seed(conn: &Connection) -> AppResult<()> {
    let data = include_str!("../data/neetcode150.json");
    let problems: Vec<Problem> = serde_json::from_str(data)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE problems SET is_curriculum=0", [])?;
    for p in problems {
        tx.execute("INSERT INTO problems(id,title,category,difficulty,leetcode_url,neetcode_url,order_index,category_order,is_curriculum) VALUES(?,?,?,?,?,?,?,?,1)
          ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,difficulty=excluded.difficulty,
          leetcode_url=excluded.leetcode_url,neetcode_url=excluded.neetcode_url,order_index=excluded.order_index,
          category_order=excluded.category_order,is_curriculum=1",
          params![p.id,p.title,p.category,p.difficulty,p.leetcode_url,p.neetcode_url,p.order_index,p.category_order])?;
    }
    tx.execute("INSERT INTO problem_books(id,title,subtitle,description,accent,order_index,built_in,created_at)
      VALUES('neetcode-150','NeetCode 150','The interview essentials','A structured path through 18 core patterns and 150 carefully selected interview problems.','forest',1,1,datetime('now'))
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,subtitle=excluded.subtitle,description=excluded.description,accent=excluded.accent,built_in=1", [])?;
    tx.execute(
        "DELETE FROM problem_book_items WHERE book_id='neetcode-150'",
        [],
    )?;
    tx.execute("INSERT INTO problem_book_items(book_id,problem_id,order_index) SELECT 'neetcode-150',id,order_index FROM problems WHERE is_curriculum=1", [])?;

    let company_catalog: CompanyBookCatalog =
        serde_json::from_str(include_str!("../data/company_books.json"))?;
    let company_catalog_is_current: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM settings WHERE key='company_catalog_version' AND value=?)",
        [&company_catalog.source_commit],
        |row| row.get(0),
    )?;
    if !company_catalog_is_current {
        for book in company_catalog.books {
            tx.execute(
                "INSERT INTO problem_books(id,title,subtitle,description,accent,order_index,built_in,created_at)
                 VALUES(?,?,?,?,?,?,1,datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET title=excluded.title,subtitle=excluded.subtitle,
                 description=excluded.description,accent=excluded.accent,order_index=excluded.order_index,built_in=1",
                params![book.id, book.title, book.subtitle, book.description, book.accent, book.order_index],
            )?;
            tx.execute("DELETE FROM problem_book_items WHERE book_id=?", [&book.id])?;
            for problem in book.problems {
                tx.execute(
                    "INSERT OR IGNORE INTO problems(id,title,category,difficulty,leetcode_url,neetcode_url,order_index,category_order,is_curriculum)
                     VALUES(?,?,?,?,?,?,?,?,0)",
                    params![problem.id, problem.title, problem.category, problem.difficulty, problem.leetcode_url, problem.neetcode_url, problem.order_index, problem.category_order],
                )?;
                tx.execute(
                    "INSERT INTO problem_book_items(book_id,problem_id,order_index) VALUES(?,?,?)",
                    params![book.id, problem.id, problem.order_index],
                )?;
            }
        }
        tx.execute(
            "INSERT INTO settings(key,value) VALUES('company_catalog_version',?)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [&company_catalog.source_commit],
        )?;
    }
    seed_global_book(&tx)?;
    remove_duplicate_problems(&tx)?;
    tx.commit()?;
    Ok(())
}

/// Very early versions stored a few problems under short ids ("three-sum") next to the canonical
/// slug row for the same LeetCode URL. Remove such a duplicate only when nothing refers to it, so no
/// history, note, draft or book entry is ever lost.
fn remove_duplicate_problems(tx: &Connection) -> AppResult<()> {
    tx.execute(
        "DELETE FROM problems WHERE is_curriculum=0
           AND leetcode_url<>'https://leetcode.com/problems/'||id||'/'
           AND EXISTS(SELECT 1 FROM problems c WHERE c.id<>problems.id AND c.leetcode_url=problems.leetcode_url
                      AND c.leetcode_url='https://leetcode.com/problems/'||c.id||'/')
           AND NOT EXISTS(SELECT 1 FROM attempts WHERE problem_id=problems.id)
           AND NOT EXISTS(SELECT 1 FROM reviews WHERE problem_id=problems.id)
           AND NOT EXISTS(SELECT 1 FROM daily_plan WHERE problem_id=problems.id)
           AND NOT EXISTS(SELECT 1 FROM problem_book_items WHERE problem_id=problems.id)
           AND NOT EXISTS(SELECT 1 FROM offline_problems WHERE problem_id=problems.id)
           AND NOT EXISTS(SELECT 1 FROM offline_submissions WHERE problem_id=problems.id)",
        [],
    )?;
    Ok(())
}

/// Every problem is stored once, keyed by its LeetCode slug; books only reference it. The catalog
/// gives every problem its real title, difficulty and topic (so URL imports need no guessing) and
/// fills the built-in "All LeetCode Problems" book with every free problem.
fn seed_global_book(tx: &Connection) -> AppResult<()> {
    let catalog: LeetCodeCatalog =
        serde_json::from_str(include_str!("../data/leetcode_catalog.json"))?;
    let version = format!("{}:{}", catalog.fetched_at, catalog.problems.len());
    let current: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM settings WHERE key='leetcode_catalog_version' AND value=?)",
        [&version],
        |row| row.get(0),
    )?;
    if current {
        return Ok(());
    }
    tx.execute("INSERT INTO problem_books(id,title,subtitle,description,accent,order_index,built_in,created_at)
      VALUES(?1,'All LeetCode Problems','Every free problem, in one place','Every free LeetCode problem by number. A problem keeps one history, notes and offline copy, whichever book you open it from.','navy',99,1,datetime('now'))
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,subtitle=excluded.subtitle,description=excluded.description,accent=excluded.accent,order_index=excluded.order_index,built_in=1", [GLOBAL_BOOK])?;
    tx.execute(
        "DELETE FROM problem_book_items WHERE book_id=?",
        [GLOBAL_BOOK],
    )?;
    let mut insert = tx.prepare(
        "INSERT OR IGNORE INTO problems(id,title,category,difficulty,leetcode_url,neetcode_url,order_index,category_order,is_curriculum)
         VALUES(?1,?2,?3,?4,?5,NULL,?6,0,0)",
    )?;
    // Earlier URL imports guessed the title from the slug; replace only those guesses.
    let mut correct = tx.prepare(
        "UPDATE problems SET title=?2,difficulty=?3 WHERE id=?1 AND is_curriculum=0 AND title=?4",
    )?;
    let mut add = tx.prepare(
        "INSERT INTO problem_book_items(book_id,problem_id,order_index) VALUES(?1,?2,?3)",
    )?;
    for p in &catalog.problems {
        let url = format!("https://leetcode.com/problems/{}/", p.id);
        insert.execute(params![
            p.id,
            p.title,
            p.category,
            p.difficulty,
            url,
            p.number
        ])?;
        correct.execute(params![
            p.id,
            p.title,
            p.difficulty,
            crate::commands::title_from_slug(&p.id)
        ])?;
        if !p.paid_only {
            add.execute(params![GLOBAL_BOOK, p.id, p.number])?;
        }
    }
    tx.execute(
        "INSERT INTO settings(key,value) VALUES('leetcode_catalog_version',?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [&version],
    )?;
    Ok(())
}

pub fn map_problem(row: &rusqlite::Row<'_>) -> rusqlite::Result<Problem> {
    Ok(Problem {
        id: row.get(0)?,
        title: row.get(1)?,
        category: row.get(2)?,
        difficulty: row.get(3)?,
        leetcode_url: row.get(4)?,
        neetcode_url: row.get(5)?,
        order_index: row.get(6)?,
        category_order: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_migration_preserves_both_attempts_across_restarts() {
        let conn = test_connection();
        conn.execute_batch("DROP INDEX idx_attempts_one_per_kind;
            CREATE UNIQUE INDEX idx_attempts_one_active ON attempts((1)) WHERE completed_at IS NULL AND abandoned_at IS NULL;
            INSERT INTO attempts(problem_id,started_at,notes,is_review) VALUES('contains-duplicate','2026-09-09T12:00:00Z','keep focus',0);").unwrap();
        migrate(&conn).unwrap();
        conn.execute("INSERT INTO attempts(problem_id,started_at,notes,is_review) VALUES('valid-anagram','2026-09-09T13:00:00Z','keep review',1)", []).unwrap();
        migrate(&conn).unwrap();
        let count: i64 = conn.query_row("SELECT count(*) FROM attempts WHERE abandoned_at IS NULL AND completed_at IS NULL AND notes IN ('keep focus','keep review')", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);
        assert!(conn.execute("INSERT INTO attempts(problem_id,started_at,is_review) VALUES('two-sum','2026-09-09T14:00:00Z',1)", []).is_err());
    }
    use std::collections::HashSet;

    #[test]
    fn neetcode_seed_is_complete_and_unique() {
        let problems: Vec<Problem> =
            serde_json::from_str(include_str!("../data/neetcode150.json")).unwrap();
        assert_eq!(problems.len(), 150);
        assert_eq!(
            problems.iter().map(|p| &p.id).collect::<HashSet<_>>().len(),
            150
        );
        assert_eq!(
            problems
                .iter()
                .map(|p| &p.leetcode_url)
                .collect::<HashSet<_>>()
                .len(),
            150
        );
        assert_eq!(
            problems
                .iter()
                .map(|p| &p.category)
                .collect::<HashSet<_>>()
                .len(),
            18
        );
        assert!(problems
            .iter()
            .enumerate()
            .all(|(index, problem)| problem.order_index == index as i32 + 1));
        assert!(problems
            .iter()
            .all(|p| matches!(p.difficulty.as_str(), "Easy" | "Medium" | "Hard")));
    }

    #[test]
    fn global_book_shares_one_problem_across_books() {
        let conn = test_connection();
        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap() };
        let catalog: LeetCodeCatalog =
            serde_json::from_str(include_str!("../data/leetcode_catalog.json")).unwrap();
        let free = catalog.problems.iter().filter(|p| !p.paid_only).count() as i64;
        assert!(free > 3000);
        assert_eq!(
            count("SELECT COUNT(*) FROM problem_book_items WHERE book_id='leetcode-all'"),
            free
        );
        // Course Schedule III: one problem row, listed by the global and a company book.
        assert_eq!(
            count("SELECT COUNT(*) FROM problems WHERE id='course-schedule-iii'"),
            1
        );
        assert_eq!(
            count("SELECT COUNT(*) FROM problem_book_items WHERE problem_id='course-schedule-iii'"),
            2
        );
        // NeetCode problems keep their curriculum metadata; premium-only problems stay out.
        let (category, curriculum): (String, bool) = conn
            .query_row(
                "SELECT category,is_curriculum FROM problems WHERE id='two-sum'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((category.as_str(), curriculum), ("Arrays & Hashing", true));
        assert_eq!(count("SELECT COUNT(*) FROM problem_book_items WHERE book_id='leetcode-all' AND problem_id='meeting-rooms'"), 0);
        assert_eq!(
            count("SELECT COUNT(*) FROM problems WHERE id='meeting-rooms'"),
            1
        );
    }

    #[test]
    fn catalog_corrects_titles_guessed_by_earlier_imports() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        crate::offline::initialize(&conn).unwrap();
        conn.execute("INSERT INTO problems(id,title,category,difficulty,leetcode_url,order_index,category_order,is_curriculum)
            VALUES('lru-cache-ii','Lru Cache Ii','Custom','Medium','https://leetcode.com/problems/lru-cache-ii/',1,0,0),
                  ('course-schedule-iii','Course Schedule Iii','Mine','Medium','https://leetcode.com/problems/course-schedule-iii/',2,0,0),
                  ('design-hashmap','My own title','Mine','Easy','https://leetcode.com/problems/design-hashmap/',3,0,0)", []).unwrap();
        seed(&conn).unwrap();
        let row = |id: &str| -> (String, String, String) {
            conn.query_row(
                "SELECT title,difficulty,category FROM problems WHERE id=?",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap()
        };
        assert_eq!(
            row("course-schedule-iii"),
            ("Course Schedule III".into(), "Hard".into(), "Mine".into())
        );
        // A title someone actually wrote is kept.
        assert_eq!(row("design-hashmap").0, "My own title");
        assert_eq!(row("lru-cache-ii").0, "Lru Cache Ii");
        seed(&conn).unwrap(); // a second launch is a no-op
    }

    #[test]
    fn unreferenced_legacy_duplicates_are_removed_and_referenced_ones_kept() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        migrate(&conn).unwrap();
        crate::offline::initialize(&conn).unwrap();
        seed(&conn).unwrap();
        conn.execute_batch("INSERT INTO problems(id,title,category,difficulty,leetcode_url,order_index,category_order,is_curriculum)
            VALUES('three-sum','3Sum','Two Pointers','Medium','https://leetcode.com/problems/3sum/',1,0,0),
                  ('best-time-stock','Best Time','Sliding Window','Easy','https://leetcode.com/problems/best-time-to-buy-and-sell-stock/',2,0,0),
                  ('only-copy','Only copy','Custom','Easy','https://leetcode.com/problems/some-unlisted-problem/',3,0,0);
            INSERT INTO attempts(problem_id,started_at) VALUES('best-time-stock','2026-01-01T00:00:00Z');").unwrap();
        seed(&conn).unwrap();
        let exists = |id: &str| -> bool {
            conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM problems WHERE id=?)",
                [id],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert!(!exists("three-sum"));
        assert!(exists("3sum"));
        assert!(
            exists("best-time-stock"),
            "a row with history is never removed"
        );
        assert!(
            exists("only-copy"),
            "a row without a canonical twin is kept"
        );
    }

    #[test]
    fn company_book_seed_is_complete_and_valid() {
        let catalog: CompanyBookCatalog =
            serde_json::from_str(include_str!("../data/company_books.json")).unwrap();
        let expected = [
            ("company-roblox", 56),
            ("company-microsoft", 1384),
            ("company-databricks", 31),
        ];

        assert_eq!(catalog.books.len(), expected.len());
        for (book, (expected_id, expected_count)) in catalog.books.iter().zip(expected) {
            assert_eq!(book.id, expected_id);
            assert_eq!(book.problems.len(), expected_count);
            assert_eq!(
                book.problems
                    .iter()
                    .map(|problem| &problem.id)
                    .collect::<HashSet<_>>()
                    .len(),
                expected_count
            );
            assert!(book.problems.iter().enumerate().all(|(index, problem)| {
                problem.order_index == index as i32 + 1
                    && matches!(problem.difficulty.as_str(), "Easy" | "Medium" | "Hard")
                    && problem
                        .leetcode_url
                        .starts_with("https://leetcode.com/problems/")
            }));
        }
    }
}
