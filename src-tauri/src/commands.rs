use crate::{
    db::{map_problem, Db},
    error::{AppError, AppResult},
    models::*,
};
use chrono::{Datelike, Duration, Local, Utc};
use rusqlite::{params, OptionalExtension};
use tauri::State;

type ActiveAttemptRow = (i64, String, String, Option<String>, i64, String, bool);

const VALID_OUTCOMES: [&str; 5] = [
    "Easy",
    "Solved",
    "Struggled",
    "Needed hint",
    "Couldn't solve",
];
const VALID_MISTAKES: [&str; 8] = [
    "Pattern recognition",
    "Implementation",
    "Edge case",
    "Overcomplicated",
    "Off-by-one",
    "Complexity",
    "Data structure",
    "Other",
];

fn query_problem(conn: &rusqlite::Connection, id: &str) -> AppResult<Problem> {
    Ok(conn.query_row("SELECT id,title,category,difficulty,leetcode_url,neetcode_url,order_index,category_order FROM problems WHERE id=?", [id], map_problem)?)
}

fn query_active_attempt_row(
    conn: &rusqlite::Connection,
    is_review: bool,
) -> AppResult<Option<ActiveAttemptRow>> {
    Ok(conn
        .query_row(
            "SELECT id,problem_id,started_at,paused_at,paused_seconds,notes,is_review FROM attempts WHERE completed_at IS NULL AND abandoned_at IS NULL AND is_review=? ORDER BY id DESC LIMIT 1",
            [is_review],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
        )
        .optional()?)
}

fn hydrate_active_attempt(
    conn: &rusqlite::Connection,
    row: ActiveAttemptRow,
) -> AppResult<ActiveAttempt> {
    Ok(ActiveAttempt {
        id: row.0,
        problem: query_problem(conn, &row.1)?,
        started_at: row.2,
        paused_at: row.3,
        paused_seconds: row.4,
        notes: row.5,
        is_review: row.6,
    })
}

fn setting(conn: &rusqlite::Connection, key: &str, fallback: &str) -> String {
    conn.query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
        r.get(0)
    })
    .unwrap_or_else(|_| fallback.into())
}

pub(crate) fn read_settings(conn: &rusqlite::Connection) -> AppSettings {
    AppSettings {
        local_model: setting(conn, "local_model", ""),
        display_name: setting(conn, "display_name", "Coder"),
        daily_focus_minutes: setting(conn, "daily_focus_minutes", "30")
            .parse()
            .unwrap_or(30),
        weekly_goal_days: setting(conn, "weekly_goal_days", "5").parse().unwrap_or(5),
        focus_duration_minutes: setting(conn, "focus_duration_minutes", "25")
            .parse()
            .unwrap_or(25),
        hint_delay_minutes: setting(conn, "hint_delay_minutes", "10")
            .parse()
            .unwrap_or(10),
        progressive_hints: setting(conn, "progressive_hints", "true") == "true",
        plant_animations: setting(conn, "plant_animations", "true") == "true",
        theme: setting(conn, "theme", "warm-garden"),
    }
}

fn validate_finish_input(input: &FinishAttemptInput) -> AppResult<()> {
    if !VALID_OUTCOMES.contains(&input.outcome.as_str()) {
        return Err(AppError::Message("Choose a valid session outcome".into()));
    }
    if !(1..=5).contains(&input.confidence) {
        return Err(AppError::Message(
            "Confidence must be between 1 and 5".into(),
        ));
    }
    if input.notes.len() > 100_000 {
        return Err(AppError::Message("Session notes are too long".into()));
    }
    if input.mistakes.len() > VALID_MISTAKES.len()
        || input
            .mistakes
            .iter()
            .any(|mistake| !VALID_MISTAKES.contains(&mistake.as_str()))
    {
        return Err(AppError::Message(
            "One or more mistake tags are invalid".into(),
        ));
    }
    Ok(())
}

fn plant_progress(xp: i32) -> (String, i32, i32, i32) {
    let levels = [
        ("Seed", 0, 100),
        ("Sprout", 100, 250),
        ("Seedling", 250, 500),
        ("Growing Plant", 500, 900),
        ("Large Plant", 900, 1500),
        ("Flowering Plant", 1500, 2500),
    ];
    let (index, &(name, floor, next)) = levels
        .iter()
        .enumerate()
        .find(|(_, (_, _, next))| xp < *next)
        .unwrap_or((levels.len() - 1, &levels[levels.len() - 1]));
    (name.into(), index as i32 + 1, floor, next)
}

pub fn get_today_plan(db: State<Db>) -> AppResult<TodayPlan> {
    let conn = db.0.lock().unwrap();
    query_today_plan(&conn)
}

fn query_today_plan(conn: &rusqlite::Connection) -> AppResult<TodayPlan> {
    let today = Local::now().date_naive().to_string();
    // Explicit daily selections take priority, but completed solves never become
    // due again. Include unfinished attempts, not just entirely unseen problems.
    let choose = |kind: &str, exclude: Option<&str>| -> AppResult<Option<String>> {
        Ok(conn.query_row(
            "SELECT p.id FROM problems p
             WHERE (p.is_curriculum=1 OR p.id IN (SELECT problem_id FROM daily_plan WHERE date=?1 AND kind=?2))
               AND (?3 IS NULL OR p.id<>?3)
               AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.problem_id=p.id AND a.completed_at IS NOT NULL AND a.outcome IN ('Easy','Solved'))
             ORDER BY (p.id IN (SELECT problem_id FROM daily_plan WHERE date=?1 AND kind=?2)) DESC,
               CASE WHEN ?2='Warm-up' AND p.difficulty='Easy' THEN 0 ELSE 1 END,p.order_index LIMIT 1",
            params![today, kind, exclude], |r| r.get(0),
        ).optional()?)
    };
    let main_id = choose("Main problem", None)?;
    let warm_id = choose("Warm-up", main_id.as_deref())?;
    let mut items = Vec::new();
    for (kind, id, estimated_minutes) in [("Warm-up", warm_id, 15), ("Main problem", main_id, 45)] {
        if let Some(id) = id {
            items.push(PlanItem {
                kind: kind.into(),
                problem: query_problem(conn, &id)?,
                estimated_minutes,
            });
        }
    }
    let xp: i32 = conn.query_row(
        "SELECT COALESCE(SUM(xp_earned),0) FROM daily_activity",
        [],
        |r| r.get(0),
    )?;
    let mut streak = 0;
    let mut day = Local::now().date_naive();
    loop {
        let done: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM daily_activity WHERE date=? AND (goal_completed=1 OR attempts_completed>0))", [day.to_string()], |r| r.get(0))?;
        if !done {
            break;
        }
        streak += 1;
        day -= Duration::days(1);
    }
    let level = plant_progress(xp).0;
    Ok(TodayPlan {
        items,
        streak,
        xp,
        level,
    })
}

#[tauri::command]
pub fn get_dashboard(db: State<Db>) -> AppResult<Dashboard> {
    let plan = get_today_plan(db.clone())?;
    let conn = db.0.lock().unwrap();
    let today = Local::now().date_naive();
    let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let mut week = Vec::with_capacity(7);
    for offset in 0..7 {
        let day = (monday + Duration::days(offset)).to_string();
        week.push(conn.query_row("SELECT EXISTS(SELECT 1 FROM daily_activity WHERE date=? AND (goal_completed=1 OR attempts_completed>0))",[day],|r|r.get(0))?);
    }
    let problem_count = conn.query_row(
        "SELECT COUNT(*) FROM problems WHERE is_curriculum=1",
        [],
        |r| r.get(0),
    )?;
    let practiced_count=conn.query_row("SELECT COUNT(DISTINCT a.problem_id) FROM attempts a JOIN problems p ON p.id=a.problem_id WHERE a.completed_at IS NOT NULL AND p.is_curriculum=1",[],|r|r.get(0))?;
    let (_, level_number, level_floor_xp, next_level_xp) = plant_progress(plan.xp);
    Ok(Dashboard {
        plan,
        week,
        level_number,
        level_floor_xp,
        next_level_xp,
        practiced_count,
        problem_count,
    })
}

#[tauri::command]
pub fn get_garden_state(db: State<Db>) -> AppResult<GardenState> {
    crate::garden::read_garden(&db.0.lock().unwrap())
}

#[cfg(test)]
mod domain_tests {
    use super::*;

    #[test]
    fn finishing_practice_does_not_schedule_or_change_legacy_reviews() {
        let mut conn = crate::db::test_connection();
        conn.execute("INSERT INTO reviews(problem_id,next_review_date,review_level) VALUES('contains-duplicate','2000-01-01',3)", []).unwrap();
        for problem in ["contains-duplicate", "valid-anagram"] {
            let attempt = start_attempt_in_db(&mut conn, problem, false).unwrap();
            finish_attempt_in_db(
                &mut conn,
                FinishAttemptInput {
                    attempt_id: attempt.id,
                    outcome: "Solved".into(),
                    confidence: 4,
                    notes: "Retained takeaway".into(),
                    mistakes: vec![],
                },
            )
            .unwrap();
        }
        let row: (i64, String, i32) = conn
            .query_row(
                "SELECT COUNT(*),next_review_date,review_level FROM reviews",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, (1, "2000-01-01".into(), 3));
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM attempts WHERE notes='Retained takeaway' AND completed_at IS NOT NULL", [], |r| r.get::<_, i64>(0)).unwrap(), 2);
    }

    #[test]
    fn solved_status_survives_old_due_dates_and_later_unsuccessful_practice() {
        let conn = crate::db::test_connection();
        conn.execute_batch(
            "INSERT INTO attempts(problem_id,started_at,completed_at,outcome) VALUES
          ('contains-duplicate','2026-01-01','2026-01-01','Solved'),
          ('contains-duplicate','2026-01-02','2026-01-02','Couldn''t solve'),
          ('valid-anagram','2026-01-01','2026-01-01','Easy'),
          ('two-sum','2026-01-01','2026-01-01','Struggled');
          INSERT INTO reviews(problem_id,next_review_date,review_level) VALUES
          ('contains-duplicate','2000-01-01',2),('two-sum','2000-01-01',1);",
        )
        .unwrap();
        let rows = query_book_problems(&conn, "neetcode-150").unwrap();
        let row = |id: &str| rows.iter().find(|r| r.problem.id == id).unwrap();
        assert_eq!(row("contains-duplicate").status, "Solved");
        assert_eq!(row("contains-duplicate").attempt_count, 2);
        assert_eq!(
            row("contains-duplicate").last_outcome.as_deref(),
            Some("Couldn't solve")
        );
        assert_eq!(row("valid-anagram").status, "Solved");
        assert_eq!(row("two-sum").status, "Attempted");
        assert_eq!(row("group-anagrams").status, "Unseen");
    }

    #[test]
    fn today_never_reschedules_solved_problems_even_when_pinned_or_all_done() {
        let conn = crate::db::test_connection();
        conn.execute_batch("INSERT INTO attempts(problem_id,started_at,completed_at,outcome) VALUES
          ('contains-duplicate','2026-01-01','2026-01-01','Solved');
          INSERT INTO reviews(problem_id,next_review_date,review_level) VALUES('contains-duplicate','2000-01-01',2);").unwrap();
        conn.execute("INSERT INTO daily_plan(date,kind,problem_id) VALUES(?,'Main problem','contains-duplicate')", [Local::now().date_naive().to_string()]).unwrap();
        let plan = query_today_plan(&conn).unwrap();
        assert_eq!(plan.items.len(), 2);
        assert!(plan
            .items
            .iter()
            .all(|item| item.problem.id != "contains-duplicate" && item.kind != "Review"));
        assert_ne!(plan.items[0].problem.id, plan.items[1].problem.id);
        conn.execute("INSERT INTO attempts(problem_id,started_at,completed_at,outcome) SELECT id,'2026-01-01','2026-01-01','Solved' FROM problems", []).unwrap();
        assert!(query_today_plan(&conn).unwrap().items.is_empty());
    }

    #[test]
    fn review_completion_preserves_the_separate_focus_attempt() {
        let mut conn = crate::db::test_connection();
        let focus = start_attempt_in_db(&mut conn, "contains-duplicate", false).unwrap();
        conn.execute(
            "UPDATE attempts SET notes='focus draft',started_at=? WHERE id=?",
            params![(Utc::now() - Duration::minutes(10)).to_rfc3339(), focus.id],
        )
        .unwrap();
        let review = start_attempt_in_db(&mut conn, "valid-anagram", true).unwrap();
        assert_ne!(focus.id, review.id);
        let preserved = query_active_attempt_row(&conn, false).unwrap().unwrap();
        assert!(preserved.3.is_some());
        assert_eq!(preserved.5, "focus draft");
        assert_eq!(
            query_active_attempt_row(&conn, true).unwrap().unwrap().0,
            review.id
        );
        assert!(start_attempt_in_db(&mut conn, "two-sum", true).is_err());
        let entry = finish_attempt_in_db(
            &mut conn,
            FinishAttemptInput {
                attempt_id: review.id,
                outcome: "Solved".into(),
                confidence: 4,
                notes: "review takeaway".into(),
                mistakes: vec![],
            },
        )
        .unwrap();
        assert!(entry.is_review);
        assert!(query_active_attempt_row(&conn, true).unwrap().is_none());
        assert_eq!(
            query_active_attempt_row(&conn, false).unwrap().unwrap(),
            preserved
        );
        let completed: i64 = conn
            .query_row(
                "SELECT SUM(attempts_completed) FROM daily_activity",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(completed, 1);
        assert_eq!(
            start_attempt_in_db(&mut conn, "contains-duplicate", false)
                .unwrap()
                .id,
            focus.id
        );
    }

    #[test]
    fn review_and_focus_can_use_the_same_problem_without_sharing_timers() {
        let mut conn = crate::db::test_connection();
        let focus = start_attempt_in_db(&mut conn, "contains-duplicate", false).unwrap();
        let review = start_attempt_in_db(&mut conn, "contains-duplicate", true).unwrap();
        assert_ne!(focus.id, review.id);
        toggle_pause_in_db(&mut conn, focus.id).unwrap();
        assert!(query_active_attempt_row(&conn, false)
            .unwrap()
            .unwrap()
            .3
            .is_none());
        assert!(query_active_attempt_row(&conn, true)
            .unwrap()
            .unwrap()
            .3
            .is_some());
        toggle_pause_in_db(&mut conn, review.id).unwrap();
        assert!(query_active_attempt_row(&conn, false)
            .unwrap()
            .unwrap()
            .3
            .is_some());
        assert!(query_active_attempt_row(&conn, true)
            .unwrap()
            .unwrap()
            .3
            .is_none());
    }

    #[test]
    fn reflection_edits_preserve_session_metadata_and_reject_active_entries() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE attempts(id INTEGER PRIMARY KEY, outcome TEXT, confidence INTEGER, notes TEXT, completed_at TEXT, abandoned_at TEXT, duration_seconds INTEGER);
            CREATE TABLE attempt_mistakes(attempt_id INTEGER, mistake_type TEXT, PRIMARY KEY(attempt_id,mistake_type));
            INSERT INTO attempts VALUES(1,'Solved',4,'old','2026-09-01',NULL,600);
            INSERT INTO attempts VALUES(2,NULL,NULL,'draft',NULL,NULL,0);
            INSERT INTO attempt_mistakes VALUES(1,'Implementation');").unwrap();
        let mut input = FinishAttemptInput {
            attempt_id: 1,
            outcome: "Struggled".into(),
            confidence: 2,
            notes: "Updated takeaway".into(),
            mistakes: vec!["Edge case".into()],
        };
        update_reflection(&mut conn, &input).unwrap();
        let saved: (String, i32, String, String, i32) = conn.query_row(
            "SELECT outcome,confidence,notes,completed_at,duration_seconds FROM attempts WHERE id=1", [],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?)),
        ).unwrap();
        assert_eq!(
            saved,
            (
                "Struggled".into(),
                2,
                "Updated takeaway".into(),
                "2026-09-01".into(),
                600
            )
        );
        let tags: String = conn
            .query_row(
                "SELECT group_concat(mistake_type) FROM attempt_mistakes WHERE attempt_id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tags, "Edge case");
        input.confidence = 6;
        assert!(update_reflection(&mut conn, &input).is_err());
        input.confidence = 3;
        input.attempt_id = 2;
        assert!(update_reflection(&mut conn, &input).is_err());
        input.attempt_id = 999;
        assert!(update_reflection(&mut conn, &input).is_err());
        input.attempt_id = 1;
        input.mistakes.clear();
        update_reflection(&mut conn, &input).unwrap();
        let count: i32 = conn
            .query_row("SELECT count(*) FROM attempt_mistakes", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn leetcode_problem_imports_are_normalized() {
        assert_eq!(
            problem_slug("https://leetcode.com/problems/network-delay-time/?envType=study-plan")
                .unwrap(),
            "network-delay-time"
        );
        assert_eq!(
            problem_slug("https://www.leetcode.com/problems/two-sum/#description").unwrap(),
            "two-sum"
        );
        assert!(problem_slug("https://example.com/problems/two-sum/").is_err());
        assert_eq!(title_from_slug("network-delay-time"), "Network Delay Time");
    }

    #[test]
    fn reflection_input_is_validated() {
        let valid = FinishAttemptInput {
            attempt_id: 1,
            outcome: "Solved".into(),
            confidence: 4,
            notes: "Used a frequency map.".into(),
            mistakes: vec!["Implementation".into()],
        };
        assert!(validate_finish_input(&valid).is_ok());

        let invalid_confidence = FinishAttemptInput {
            confidence: 0,
            ..valid
        };
        assert!(validate_finish_input(&invalid_confidence).is_err());
    }
}

pub fn get_active_attempt(db: State<Db>, is_review: bool) -> AppResult<Option<ActiveAttempt>> {
    let conn = db.0.lock().unwrap();
    query_active_attempt_row(&conn, is_review)?
        .map(|row| hydrate_active_attempt(&conn, row))
        .transpose()
}

#[tauri::command]
pub fn start_attempt(
    problem_id: String,
    is_review: bool,
    db: State<Db>,
) -> AppResult<ActiveAttempt> {
    start_attempt_in_db(&mut db.0.lock().unwrap(), &problem_id, is_review)
}

fn pause_other_attempts(conn: &rusqlite::Connection, except_id: i64) -> AppResult<()> {
    conn.execute("UPDATE attempts SET paused_at=? WHERE id<>? AND completed_at IS NULL AND abandoned_at IS NULL AND paused_at IS NULL",
        params![Utc::now().to_rfc3339(), except_id])?;
    Ok(())
}

fn start_attempt_in_db(
    conn: &mut rusqlite::Connection,
    problem_id: &str,
    is_review: bool,
) -> AppResult<ActiveAttempt> {
    let tx = conn.transaction()?;
    let problem = query_problem(&tx, problem_id)?;
    if let Some(row) = query_active_attempt_row(&tx, is_review)? {
        if row.1 != problem_id {
            return Err(AppError::Message(
                if is_review {
                    "A previous review is still in progress. Resume or end it from Study first."
                } else {
                    "A focus session is already in progress. Resume or end it from Today first."
                }
                .into(),
            ));
        }
        pause_other_attempts(&tx, row.0)?;
        let attempt = hydrate_active_attempt(&tx, row)?;
        tx.commit()?;
        return Ok(attempt);
    }
    pause_other_attempts(&tx, -1)?;
    let now = Utc::now().to_rfc3339();
    tx.execute(
        "INSERT INTO attempts(problem_id,started_at,is_review) VALUES(?,?,?)",
        params![problem_id, now, is_review],
    )?;
    let id = tx.last_insert_rowid();
    tx.commit()?;
    Ok(ActiveAttempt {
        id,
        problem,
        started_at: now,
        paused_at: None,
        paused_seconds: 0,
        notes: String::new(),
        is_review,
    })
}

#[tauri::command]
pub fn toggle_pause(attempt_id: i64, db: State<Db>) -> AppResult<()> {
    toggle_pause_in_db(&mut db.0.lock().unwrap(), attempt_id)
}

fn toggle_pause_in_db(db: &mut rusqlite::Connection, attempt_id: i64) -> AppResult<()> {
    let conn = db.transaction()?;
    let paused: Option<Option<String>> = conn
        .query_row(
            "SELECT paused_at FROM attempts WHERE id=? AND completed_at IS NULL AND abandoned_at IS NULL",
            [attempt_id],
            |row| row.get(0),
        )
        .optional()?;
    let Some(paused) = paused else {
        return Err(AppError::Message(
            "This focus session is no longer active".into(),
        ));
    };
    if let Some(at) = paused {
        pause_other_attempts(&conn, attempt_id)?;
        let start = chrono::DateTime::parse_from_rfc3339(&at)
            .map_err(|e| AppError::Message(e.to_string()))?;
        let seconds = (Utc::now() - start.with_timezone(&Utc)).num_seconds();
        conn.execute(
            "UPDATE attempts SET paused_at=NULL, paused_seconds=paused_seconds+? WHERE id=? AND completed_at IS NULL AND abandoned_at IS NULL",
            params![seconds, attempt_id],
        )?;
    } else {
        conn.execute(
            "UPDATE attempts SET paused_at=? WHERE id=? AND completed_at IS NULL AND abandoned_at IS NULL",
            params![Utc::now().to_rfc3339(), attempt_id],
        )?;
    }
    conn.commit()?;
    Ok(())
}

#[tauri::command]
pub fn pause_attempt(attempt_id: i64, db: State<Db>) -> AppResult<()> {
    db.0.lock().unwrap().execute(
        "UPDATE attempts SET paused_at=? WHERE id=? AND paused_at IS NULL AND completed_at IS NULL AND abandoned_at IS NULL",
        params![Utc::now().to_rfc3339(), attempt_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn save_attempt_notes(attempt_id: i64, notes: String, db: State<Db>) -> AppResult<()> {
    if notes.len() > 100_000 {
        return Err(AppError::Message("Session notes are too long".into()));
    }
    let updated = db.0.lock().unwrap().execute(
        "UPDATE attempts SET notes=? WHERE id=? AND completed_at IS NULL AND abandoned_at IS NULL",
        params![notes, attempt_id],
    )?;
    if updated != 1 {
        return Err(AppError::Message(
            "This focus session is no longer active".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn abandon_attempt(attempt_id: i64, db: State<Db>) -> AppResult<()> {
    abandon_attempt_in_db(&mut db.0.lock().unwrap(), attempt_id, Utc::now())
}

/// Ending early still preserves earned focus time, without inventing a journal
/// reflection or changing review scheduling. Older ended attempts with no
/// duration are left alone: their discarded pause timestamps can't be recovered.
pub(crate) fn abandon_attempt_in_db(
    conn: &mut rusqlite::Connection,
    id: i64,
    now: chrono::DateTime<Utc>,
) -> AppResult<()> {
    let tx = conn.transaction()?;
    let attempt: Option<(String, Option<String>, i64)> = tx
        .query_row(
            "SELECT started_at,paused_at,paused_seconds FROM attempts
         WHERE id=? AND completed_at IS NULL AND abandoned_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    if let Some((start, pause, paused_seconds)) = attempt {
        let seconds = attempt_duration(&start, pause.as_deref(), paused_seconds, now)?;
        tx.execute(
            "UPDATE attempts SET abandoned_at=?,duration_seconds=?,paused_at=NULL WHERE id=?",
            params![now.to_rfc3339(), seconds, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

fn attempt_duration(
    start: &str,
    pause: Option<&str>,
    paused_seconds: i64,
    now: chrono::DateTime<Utc>,
) -> AppResult<i64> {
    let parse = |value: &str| {
        chrono::DateTime::parse_from_rfc3339(value)
            .map(|date| date.with_timezone(&Utc))
            .map_err(|error| AppError::Message(error.to_string()))
    };
    let end = pause.map(parse).transpose()?.unwrap_or(now).min(now);
    Ok(((end - parse(start)?).num_seconds() - paused_seconds.max(0)).max(0))
}

#[tauri::command]
pub fn finish_attempt(input: FinishAttemptInput, db: State<Db>) -> AppResult<JournalEntry> {
    finish_attempt_in_db(&mut db.0.lock().unwrap(), input)
}

fn finish_attempt_in_db(
    conn: &mut rusqlite::Connection,
    input: FinishAttemptInput,
) -> AppResult<JournalEntry> {
    validate_finish_input(&input)?;
    let tx = conn.transaction()?;
    let now = Utc::now();
    let attempt: Option<(String, String, Option<String>, i64, bool)> = tx
        .query_row(
            "SELECT problem_id,started_at,paused_at,paused_seconds,is_review FROM attempts WHERE id=? AND completed_at IS NULL AND abandoned_at IS NULL",
            [input.attempt_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .optional()?;
    let Some((problem_id, started_at, paused_at, paused_seconds, is_review)) = attempt else {
        return Err(AppError::Message(
            "This focus session was already completed or ended".into(),
        ));
    };
    let duration = attempt_duration(&started_at, paused_at.as_deref(), paused_seconds, now)?;
    let updated = tx.execute(
        "UPDATE attempts SET completed_at=?,duration_seconds=?,outcome=?,confidence=?,notes=?,paused_at=NULL WHERE id=? AND completed_at IS NULL AND abandoned_at IS NULL",
        params![now.to_rfc3339(),duration,&input.outcome,input.confidence,&input.notes,input.attempt_id],
    )?;
    if updated != 1 {
        return Err(AppError::Message(
            "This focus session changed before it could be saved".into(),
        ));
    }
    for mistake in &input.mistakes {
        tx.execute(
            "INSERT OR IGNORE INTO attempt_mistakes VALUES(?,?)",
            params![input.attempt_id, mistake],
        )?;
    }
    // Scheduling is retired. Keep existing review rows for history/backups, but
    // finishing a session must not create or advance a due date.
    let xp =
        20 + if input.outcome == "Easy" || input.outcome == "Solved" {
            10
        } else {
            0
        } + if is_review { 10 } else { 0 };
    let today = Local::now().date_naive().to_string();
    let daily_goal_minutes: i64 = tx
        .query_row(
            "SELECT value FROM settings WHERE key='daily_focus_minutes'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|value| value.parse().ok())
        .unwrap_or(30);
    let daily_goal_seconds = daily_goal_minutes * 60;
    tx.execute("INSERT INTO daily_activity(date,focused_seconds,attempts_completed,goal_completed,xp_earned) VALUES(?,?,1,CASE WHEN ?>=? THEN 1 ELSE 0 END,?) ON CONFLICT(date) DO UPDATE SET focused_seconds=focused_seconds+excluded.focused_seconds,attempts_completed=attempts_completed+1,goal_completed=CASE WHEN daily_activity.focused_seconds+excluded.focused_seconds>=? THEN 1 ELSE daily_activity.goal_completed END,xp_earned=xp_earned+excluded.xp_earned",params![today,duration,duration,daily_goal_seconds,xp,daily_goal_seconds])?;
    tx.commit()?;
    let problem = query_problem(conn, &problem_id)?;
    Ok(JournalEntry {
        id: input.attempt_id,
        problem,
        completed_at: now.to_rfc3339(),
        duration_seconds: duration,
        outcome: input.outcome,
        confidence: input.confidence,
        notes: input.notes,
        mistakes: input.mistakes,
        is_review,
    })
}

#[tauri::command]
pub fn get_journal(db: State<Db>) -> AppResult<Vec<JournalEntry>> {
    let conn = db.0.lock().unwrap();
    let mut s=conn.prepare("SELECT a.id,p.id,p.title,p.category,p.difficulty,p.leetcode_url,p.neetcode_url,p.order_index,p.category_order,a.completed_at,a.duration_seconds,a.outcome,a.confidence,a.notes,a.is_review,COALESCE(GROUP_CONCAT(m.mistake_type, X'1F'),'') FROM attempts a JOIN problems p ON p.id=a.problem_id LEFT JOIN attempt_mistakes m ON m.attempt_id=a.id WHERE a.completed_at IS NOT NULL GROUP BY a.id ORDER BY a.completed_at DESC")?;
    let mut rows = s.query([])?;
    let mut out = vec![];
    while let Some(r) = rows.next()? {
        let mistakes = r
            .get::<_, String>(15)?
            .split('\u{1f}')
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect();
        out.push(JournalEntry {
            id: r.get(0)?,
            problem: Problem {
                id: r.get(1)?,
                title: r.get(2)?,
                category: r.get(3)?,
                difficulty: r.get(4)?,
                leetcode_url: r.get(5)?,
                neetcode_url: r.get(6)?,
                order_index: r.get(7)?,
                category_order: r.get(8)?,
            },
            completed_at: r.get(9)?,
            duration_seconds: r.get(10)?,
            outcome: r.get(11)?,
            confidence: r.get(12)?,
            notes: r.get(13)?,
            is_review: r.get(14)?,
            mistakes,
        });
    }
    Ok(out)
}

fn update_reflection(conn: &mut rusqlite::Connection, input: &FinishAttemptInput) -> AppResult<()> {
    validate_finish_input(input)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE attempts SET outcome=?1,confidence=?2,notes=?3 WHERE id=?4 AND completed_at IS NOT NULL AND abandoned_at IS NULL",
        params![input.outcome, input.confidence, input.notes, input.attempt_id],
    )?;
    if changed != 1 {
        return Err(AppError::Message(
            "Completed journal entry not found".into(),
        ));
    }
    tx.execute(
        "DELETE FROM attempt_mistakes WHERE attempt_id=?1",
        [input.attempt_id],
    )?;
    for mistake in &input.mistakes {
        tx.execute(
            "INSERT OR IGNORE INTO attempt_mistakes(attempt_id,mistake_type) VALUES(?1,?2)",
            params![input.attempt_id, mistake],
        )?;
    }
    // Editing a reflection must not award activity or reschedule a review.
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn update_journal_entry(input: FinishAttemptInput, db: State<Db>) -> AppResult<()> {
    update_reflection(&mut db.0.lock().unwrap(), &input)
}

#[tauri::command]
pub fn get_settings(db: State<Db>) -> AppResult<AppSettings> {
    Ok(read_settings(&db.0.lock().unwrap()))
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, db: State<Db>) -> AppResult<AppSettings> {
    if settings.local_model.len() > 1024 {
        return Err(AppError::Message("Model identifier is too long".into()));
    }
    if settings.display_name.trim().is_empty() {
        return Err(AppError::Message("Display name cannot be empty".into()));
    }
    if !(5..=240).contains(&settings.daily_focus_minutes)
        || !(1..=7).contains(&settings.weekly_goal_days)
        || !(5..=180).contains(&settings.focus_duration_minutes)
        || !(1..=60).contains(&settings.hint_delay_minutes)
    {
        return Err(AppError::Message(
            "One or more settings are outside the supported range".into(),
        ));
    }
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    let values = [
        ("local_model", settings.local_model.clone()),
        ("display_name", settings.display_name.trim().to_string()),
        (
            "daily_focus_minutes",
            settings.daily_focus_minutes.to_string(),
        ),
        ("weekly_goal_days", settings.weekly_goal_days.to_string()),
        (
            "focus_duration_minutes",
            settings.focus_duration_minutes.to_string(),
        ),
        (
            "hint_delay_minutes",
            settings.hint_delay_minutes.to_string(),
        ),
        ("progressive_hints", settings.progressive_hints.to_string()),
        ("plant_animations", settings.plant_animations.to_string()),
        ("theme", settings.theme.clone()),
    ];
    for (key, value) in values {
        tx.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value])?;
    }
    tx.commit()?;
    Ok(settings)
}

#[tauri::command]
pub fn get_focus_context(
    db: State<Db>,
    is_review: Option<bool>,
) -> AppResult<Option<FocusContext>> {
    let attempt = match get_active_attempt(db.clone(), is_review.unwrap_or(false))? {
        Some(a) => a,
        None => return Ok(None),
    };
    let settings = read_settings(&db.0.lock().unwrap());
    let hints = match attempt.problem.category.as_str() {
        "Arrays & Hashing" => vec![
            "Identify what information must be looked up repeatedly.",
            "Consider trading extra space for constant-time membership checks.",
            "Write down the invariant your map or set maintains.",
        ],
        "Two Pointers" => vec![
            "Look for a relationship between values at opposite ends.",
            "Decide which pointer move makes measurable progress.",
            "State the loop invariant before implementing.",
        ],
        "Sliding Window" => vec![
            "Ask whether neighboring candidates share most of their state.",
            "Track exactly what makes the current window valid.",
            "Shrink only until the invariant is restored.",
        ],
        "Stack" => vec![
            "Look for nested structure or unresolved previous items.",
            "Decide what each stack entry represents.",
            "Check whether a monotonic stack exposes the next useful element.",
        ],
        "Binary Search" => vec![
            "Find a monotonic predicate rather than only a sorted array.",
            "Define whether each boundary is inclusive.",
            "Prove the search interval shrinks every iteration.",
        ],
        "Graphs" => vec![
            "Model vertices, edges, and the visited state explicitly.",
            "Choose traversal or connectivity tracking based on the question.",
            "For cycle detection, ask whether endpoints are already connected.",
        ],
        "Trees" => vec![
            "Define what information each recursive call returns.",
            "Handle the empty subtree before combining children.",
            "Consider whether DFS or BFS matches the requested ordering.",
        ],
        _ => vec![
            "Write down the smallest useful subproblem.",
            "State the invariant before coding.",
            "Test the boundary cases with a tiny example.",
        ],
    }
    .into_iter()
    .map(str::to_string)
    .collect();
    Ok(Some(FocusContext {
        attempt,
        hints,
        target_minutes: settings.focus_duration_minutes,
    }))
}

#[tauri::command]
pub fn set_today_plan_item(
    kind: String,
    problem_id: String,
    db: State<Db>,
) -> AppResult<TodayPlan> {
    if kind != "Warm-up" && kind != "Main problem" {
        return Err(AppError::Message(
            "Only warm-up and main problem can be replaced".into(),
        ));
    }
    let conn = db.0.lock().unwrap();
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM problems WHERE id=?)",
        [&problem_id],
        |r| r.get(0),
    )?;
    if !exists {
        return Err(AppError::Message(
            "Problem does not exist in your library".into(),
        ));
    }
    conn.execute("INSERT INTO daily_plan(date,kind,problem_id) VALUES(?,?,?) ON CONFLICT(date,kind) DO UPDATE SET problem_id=excluded.problem_id",params![Local::now().date_naive().to_string(),kind,problem_id])?;
    drop(conn);
    get_today_plan(db)
}

#[tauri::command]
pub fn get_problem_library(db: State<Db>) -> AppResult<Vec<ProblemBook>> {
    let conn = db.0.lock().unwrap();
    let mut stmt=conn.prepare("SELECT b.id,b.title,b.subtitle,b.description,b.accent,b.built_in,
      COUNT(i.problem_id),
      COUNT(DISTINCT CASE WHEN EXISTS(SELECT 1 FROM attempts a WHERE a.problem_id=i.problem_id AND a.completed_at IS NOT NULL) THEN i.problem_id END),
      COUNT(DISTINCT CASE WHEN (SELECT outcome FROM attempts a WHERE a.problem_id=i.problem_id AND a.completed_at IS NOT NULL ORDER BY a.completed_at DESC LIMIT 1) IN ('Easy','Solved') THEN i.problem_id END)
      FROM problem_books b LEFT JOIN problem_book_items i ON i.book_id=b.id
      GROUP BY b.id ORDER BY b.built_in DESC,b.order_index,b.created_at")?;
    let books = stmt
        .query_map([], |r| {
            Ok(ProblemBook {
                id: r.get(0)?,
                title: r.get(1)?,
                subtitle: r.get(2)?,
                description: r.get(3)?,
                accent: r.get(4)?,
                built_in: r.get(5)?,
                problem_count: r.get(6)?,
                practiced_count: r.get(7)?,
                solved_count: r.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(books)
}

const BOOK_ACCENTS: [&str; 5] = ["forest", "sage", "clay", "navy", "plum"];

fn validate_book_input(input: &CreateBookInput) -> AppResult<()> {
    if input.title.trim().is_empty() || input.title.trim().chars().count() > 80 {
        return Err(AppError::Message(
            "Book title must be between 1 and 80 characters".into(),
        ));
    }
    if input.subtitle.trim().chars().count() > 120 || input.description.trim().chars().count() > 600
    {
        return Err(AppError::Message("Book description is too long".into()));
    }
    if !BOOK_ACCENTS.contains(&input.accent.as_str()) {
        return Err(AppError::Message("Choose a supported book cover".into()));
    }
    Ok(())
}

fn problem_slug(raw_url: &str) -> AppResult<String> {
    let without_fragment = raw_url.trim().split(['?', '#']).next().unwrap_or_default();
    let path = without_fragment
        .strip_prefix("https://leetcode.com/problems/")
        .or_else(|| without_fragment.strip_prefix("https://www.leetcode.com/problems/"))
        .ok_or_else(|| {
            AppError::Message("Every imported URL must be a secure LeetCode problem URL".into())
        })?;
    let slug = path.split('/').next().unwrap_or_default();
    if slug.is_empty()
        || slug.len() > 120
        || !slug
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err(AppError::Message(
            "A LeetCode problem URL contains an invalid slug".into(),
        ));
    }
    Ok(slug.to_string())
}

pub(crate) fn title_from_slug(slug: &str) -> String {
    slug.split('-')
        .filter(|word| !word.is_empty())
        .map(|word| {
            let mut characters = word.chars();
            characters
                .next()
                .map(|first| first.to_ascii_uppercase().to_string() + characters.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub fn create_problem_book(input: CreateBookInput, db: State<Db>) -> AppResult<ProblemBook> {
    validate_book_input(&input)?;
    let title = input.title.trim();
    let id = format!("custom-{}", Utc::now().timestamp_millis());
    let conn = db.0.lock().unwrap();
    let order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(order_index),0)+1 FROM problem_books",
        [],
        |r| r.get(0),
    )?;
    conn.execute("INSERT INTO problem_books(id,title,subtitle,description,accent,order_index,built_in,created_at) VALUES(?,?,?,?,?,?,0,?)",params![id,title,input.subtitle.trim(),input.description.trim(),input.accent,order,Utc::now().to_rfc3339()])?;
    Ok(ProblemBook {
        id,
        title: title.into(),
        subtitle: input.subtitle.trim().into(),
        description: input.description.trim().into(),
        accent: input.accent,
        problem_count: 0,
        practiced_count: 0,
        solved_count: 0,
        built_in: false,
    })
}

#[tauri::command]
pub fn update_problem_book(
    book_id: String,
    input: CreateBookInput,
    db: State<Db>,
) -> AppResult<()> {
    validate_book_input(&input)?;
    let updated = db.0.lock().unwrap().execute(
        "UPDATE problem_books SET title=?,subtitle=?,description=?,accent=? WHERE id=? AND built_in=0",
        params![
            input.title.trim(),
            input.subtitle.trim(),
            input.description.trim(),
            input.accent,
            book_id
        ],
    )?;
    if updated != 1 {
        return Err(AppError::Message(
            "Built-in or missing books cannot be edited".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn import_book_problems(
    book_id: String,
    input: ImportBookProblemsInput,
    db: State<Db>,
) -> AppResult<ImportBookProblemsResult> {
    let category = input.category.trim();
    if category.is_empty() || category.chars().count() > 60 {
        return Err(AppError::Message(
            "Choose a topic between 1 and 60 characters".into(),
        ));
    }
    if !matches!(input.difficulty.as_str(), "Easy" | "Medium" | "Hard") {
        return Err(AppError::Message("Choose Easy, Medium, or Hard".into()));
    }
    if input.urls.is_empty() || input.urls.len() > 200 {
        return Err(AppError::Message(
            "Import between 1 and 200 problem URLs at a time".into(),
        ));
    }
    let mut slugs = Vec::with_capacity(input.urls.len());
    for url in input.urls {
        let slug = problem_slug(&url)?;
        if !slugs.contains(&slug) {
            slugs.push(slug);
        }
    }
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    let custom_book: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM problem_books WHERE id=? AND built_in=0)",
        [&book_id],
        |row| row.get(0),
    )?;
    if !custom_book {
        return Err(AppError::Message(
            "Problems can only be imported into personal books".into(),
        ));
    }
    let next_problem_order: i32 = tx.query_row(
        "SELECT COALESCE(MAX(order_index),0)+1 FROM problems",
        [],
        |row| row.get(0),
    )?;
    let mut next_book_order: i32 = tx.query_row(
        "SELECT COALESCE(MAX(order_index),0)+1 FROM problem_book_items WHERE book_id=?",
        [&book_id],
        |row| row.get(0),
    )?;
    let mut added = 0;
    let mut already_present = 0;
    for (offset, slug) in slugs.into_iter().enumerate() {
        let title = title_from_slug(&slug);
        let leetcode_url = format!("https://leetcode.com/problems/{slug}/");
        tx.execute(
            "INSERT OR IGNORE INTO problems(id,title,category,difficulty,leetcode_url,neetcode_url,order_index,category_order,is_curriculum) VALUES(?,?,?,?,?,NULL,?,0,0)",
            params![slug,title,category,input.difficulty,leetcode_url,next_problem_order + offset as i32],
        )?;
        let inserted = tx.execute(
            "INSERT OR IGNORE INTO problem_book_items(book_id,problem_id,order_index) VALUES(?,?,?)",
            params![book_id,slug,next_book_order],
        )?;
        if inserted == 1 {
            added += 1;
            next_book_order += 1;
        } else {
            already_present += 1;
        }
    }
    tx.commit()?;
    Ok(ImportBookProblemsResult {
        added,
        already_present,
    })
}

#[tauri::command]
pub fn remove_book_problem(book_id: String, problem_id: String, db: State<Db>) -> AppResult<()> {
    let removed = db.0.lock().unwrap().execute(
        "DELETE FROM problem_book_items WHERE book_id=? AND problem_id=? AND EXISTS(SELECT 1 FROM problem_books WHERE id=? AND built_in=0)",
        params![book_id,problem_id,book_id],
    )?;
    if removed != 1 {
        return Err(AppError::Message(
            "This problem is not in an editable personal book".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn delete_problem_book(book_id: String, db: State<Db>) -> AppResult<()> {
    let deleted = db.0.lock().unwrap().execute(
        "DELETE FROM problem_books WHERE id=? AND built_in=0",
        [&book_id],
    )?;
    if deleted != 1 {
        return Err(AppError::Message(
            "Built-in or missing books cannot be deleted".into(),
        ));
    }
    Ok(())
}

/// The books that list a problem. The problem itself (history, notes, offline copy) is shared.
#[tauri::command]
pub fn get_problem_books(problem_id: String, db: State<Db>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT b.id FROM problem_book_items i JOIN problem_books b ON b.id=i.book_id
         WHERE i.problem_id=? ORDER BY b.built_in DESC,b.order_index,b.created_at",
    )?;
    let ids = stmt
        .query_map([problem_id], |r| r.get(0))?
        .collect::<Result<Vec<String>, _>>()?;
    Ok(ids)
}

#[tauri::command]
pub fn get_book_problems(book_id: String, db: State<Db>) -> AppResult<Vec<ProblemOverview>> {
    let conn = db.0.lock().unwrap();
    query_book_problems(&conn, &book_id)
}

fn query_book_problems(
    conn: &rusqlite::Connection,
    book_id: &str,
) -> AppResult<Vec<ProblemOverview>> {
    let mut stmt=conn.prepare("SELECT p.id,p.title,p.category,p.difficulty,p.leetcode_url,p.neetcode_url,i.order_index,p.category_order,
      COUNT(a.id),(SELECT outcome FROM attempts la WHERE la.problem_id=p.id AND la.completed_at IS NOT NULL ORDER BY la.completed_at DESC LIMIT 1),
      (SELECT completed_at FROM attempts la WHERE la.problem_id=p.id AND la.completed_at IS NOT NULL ORDER BY la.completed_at DESC LIMIT 1),
      MAX(CASE WHEN a.outcome IN ('Easy','Solved') THEN 1 ELSE 0 END)
      FROM problem_book_items i JOIN problems p ON p.id=i.problem_id LEFT JOIN attempts a ON a.problem_id=p.id AND a.completed_at IS NOT NULL
      WHERE i.book_id=? GROUP BY p.id ORDER BY i.order_index")?;
    let problems = stmt
        .query_map([book_id], |r| {
            let count: i32 = r.get(8)?;
            let last: Option<String> = r.get(9)?;
            let solved: bool = r.get(11)?;
            let status = if solved {
                "Solved"
            } else if count == 0 {
                "Unseen"
            } else {
                "Attempted"
            }
            .to_string();
            Ok(ProblemOverview {
                problem: Problem {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    category: r.get(2)?,
                    difficulty: r.get(3)?,
                    leetcode_url: r.get(4)?,
                    neetcode_url: r.get(5)?,
                    order_index: r.get(6)?,
                    category_order: r.get(7)?,
                },
                status,
                attempt_count: count,
                last_outcome: last,
                last_attempted_at: r.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(problems)
}
