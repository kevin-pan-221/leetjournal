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

pub fn initialize(app: &AppHandle) -> AppResult<Db> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::Message(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    let conn = Connection::open(dir.join("leetjournal.sqlite3"))?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")?;
    migrate(&conn)?;
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
    conn.execute("UPDATE attempts SET abandoned_at=datetime('now'),paused_at=NULL WHERE completed_at IS NULL AND abandoned_at IS NULL AND id<>(SELECT MAX(id) FROM attempts WHERE completed_at IS NULL AND abandoned_at IS NULL)", [])?;
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_one_active ON attempts((1)) WHERE completed_at IS NULL AND abandoned_at IS NULL", [])?;
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
    tx.commit()?;
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
