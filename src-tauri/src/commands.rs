use crate::{
    db::{map_problem, Db},
    error::{AppError, AppResult},
    models::*,
};
use chrono::{Datelike, Duration, Local, Utc};
use futures_util::{
    future::{AbortHandle, Abortable},
    lock::Mutex as AsyncMutex,
    StreamExt,
};
use rusqlite::{params, OptionalExtension};
use std::sync::Mutex;
use tauri::{ipc::Channel, AppHandle, Manager, State};

type ActiveAttemptRow = (i64, String, String, Option<String>, i64, String, bool);

const REVIEW_QUERY: &str = "SELECT p.id,p.title,p.category,p.difficulty,p.leetcode_url,p.neetcode_url,p.order_index,p.category_order,r.next_review_date,r.review_level,COALESCE((SELECT outcome FROM attempts WHERE problem_id=p.id AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1),'Attempted') FROM reviews r JOIN problems p ON p.id=r.problem_id WHERE (?1 IS NULL OR r.next_review_date<=?1) ORDER BY r.next_review_date,p.order_index LIMIT ?2";
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

fn map_review(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReviewItem> {
    Ok(ReviewItem {
        problem: Problem {
            id: row.get(0)?,
            title: row.get(1)?,
            category: row.get(2)?,
            difficulty: row.get(3)?,
            leetcode_url: row.get(4)?,
            neetcode_url: row.get(5)?,
            order_index: row.get(6)?,
            category_order: row.get(7)?,
        },
        next_review_date: row.get(8)?,
        review_level: row.get(9)?,
        last_outcome: row.get(10)?,
    })
}

fn query_reviews(
    conn: &rusqlite::Connection,
    due_on_or_before: Option<&str>,
    limit: Option<usize>,
) -> AppResult<Vec<ReviewItem>> {
    let mut statement = conn.prepare(REVIEW_QUERY)?;
    let rows = statement
        .query_map(
            params![
                due_on_or_before,
                limit.map_or(i64::MAX, |value| value as i64)
            ],
            map_review,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn query_active_attempt_row(conn: &rusqlite::Connection) -> AppResult<Option<ActiveAttemptRow>> {
    Ok(conn
        .query_row(
            "SELECT id,problem_id,started_at,paused_at,paused_seconds,notes,is_review FROM attempts WHERE completed_at IS NULL AND abandoned_at IS NULL ORDER BY id DESC LIMIT 1",
            [],
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

fn read_settings(conn: &rusqlite::Connection) -> AppSettings {
    AppSettings {
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

const REVIEW_INTERVAL_DAYS: [i64; 7] = [1, 3, 7, 14, 30, 60, 120];

fn review_schedule(current_level: i32, outcome: &str, confidence: i32) -> (i32, i64) {
    let current = current_level.clamp(0, REVIEW_INTERVAL_DAYS.len() as i32 - 1);
    let mut next = match outcome {
        "Easy" => current + 2,
        "Solved" => current + 1,
        "Struggled" => current - 1,
        "Needed hint" => current - 2,
        _ => 0,
    };
    if matches!(outcome, "Easy" | "Solved") && confidence == 5 {
        next += 1;
    } else if outcome != "Couldn't solve" && confidence <= 2 {
        next -= 1;
    }
    let level = next.clamp(0, REVIEW_INTERVAL_DAYS.len() as i32 - 1);
    (level, REVIEW_INTERVAL_DAYS[level as usize])
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

pub(crate) fn garden_stage_for(practiced: u32) -> GardenStage {
    match practiced {
        0..=10 => GardenStage::OpenField,
        11..=30 => GardenStage::YoungGrove,
        31..=60 => GardenStage::Meadow,
        61..=90 => GardenStage::Homestead,
        91..=120 => GardenStage::Valley,
        _ => GardenStage::Countryside,
    }
}

pub(crate) fn garden_vitality_for(
    days_since_practice: Option<i64>,
    reviews_due: u32,
    significantly_overdue: u32,
) -> GardenVitality {
    match days_since_practice {
        Some(days) if days <= 2 && significantly_overdue == 0 && reviews_due <= 2 => {
            GardenVitality::Thriving
        }
        None | Some(6..) => GardenVitality::NeedsCare,
        _ if significantly_overdue >= 3 || reviews_due >= 5 => GardenVitality::NeedsCare,
        _ => GardenVitality::Calm,
    }
}

pub fn get_today_plan(db: State<Db>) -> AppResult<TodayPlan> {
    let conn = db.0.lock().unwrap();
    let today = Local::now().date_naive().to_string();
    let automatic_main: String = conn.query_row("SELECT p.id FROM problems p WHERE p.is_curriculum=1 AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.problem_id=p.id AND a.completed_at IS NOT NULL) ORDER BY p.order_index LIMIT 1", [], |r| r.get(0)).optional()?.or_else(|| conn.query_row("SELECT id FROM problems WHERE is_curriculum=1 ORDER BY order_index LIMIT 1", [], |r|r.get(0)).optional().ok().flatten()).ok_or_else(||AppError::Message("The curriculum is empty".into()))?;
    let unseen_id: String = conn
        .query_row(
            "SELECT problem_id FROM daily_plan WHERE date=? AND kind='Main problem'",
            [&today],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(automatic_main);
    let automatic_warm: String = conn.query_row("SELECT p.id FROM problems p JOIN attempts a ON a.problem_id=p.id AND a.completed_at IS NOT NULL WHERE p.is_curriculum=1 AND p.difficulty='Easy' AND p.id<>? GROUP BY p.id ORDER BY MAX(a.completed_at) ASC LIMIT 1", [&unseen_id], |r| r.get(0)).optional()?.or_else(|| conn.query_row("SELECT id FROM problems WHERE is_curriculum=1 AND difficulty='Easy' AND id<>? ORDER BY order_index LIMIT 1", [&unseen_id], |r|r.get(0)).optional().ok().flatten()).unwrap_or_else(||unseen_id.clone());
    let warm_id: String = conn
        .query_row(
            "SELECT problem_id FROM daily_plan WHERE date=? AND kind='Warm-up'",
            [&today],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(automatic_warm);
    let review_id: Option<String> = conn.query_row("SELECT problem_id FROM reviews WHERE next_review_date<=? ORDER BY next_review_date LIMIT 1", [&today], |r| r.get(0)).optional()?;
    let mut items = vec![
        PlanItem {
            kind: "Warm-up".into(),
            problem: query_problem(&conn, &warm_id)?,
            estimated_minutes: 15,
        },
        PlanItem {
            kind: "Main problem".into(),
            problem: query_problem(&conn, &unseen_id)?,
            estimated_minutes: 45,
        },
    ];
    if let Some(id) = review_id {
        items.push(PlanItem {
            kind: "Review".into(),
            problem: query_problem(&conn, &id)?,
            estimated_minutes: 20,
        });
    }
    let reviews_due = conn.query_row(
        "SELECT COUNT(*) FROM reviews WHERE next_review_date<=?",
        [&today],
        |r| r.get(0),
    )?;
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
        reviews_due,
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
    let today_string = today.to_string();
    let due_reviews = query_reviews(&conn, Some(&today_string), Some(3))?;
    let (_, level_number, level_floor_xp, next_level_xp) = plant_progress(plan.xp);
    Ok(Dashboard {
        plan,
        week,
        level_number,
        level_floor_xp,
        next_level_xp,
        practiced_count,
        problem_count,
        due_reviews,
    })
}

#[tauri::command]
pub fn get_garden_state(db: State<Db>) -> AppResult<GardenState> {
    let plan = get_today_plan(db.clone())?;
    let today_problem = plan
        .items
        .iter()
        .find(|item| item.kind == "Main problem")
        .or_else(|| plan.items.first())
        .map(|item| item.problem.clone())
        .ok_or_else(|| AppError::Message("Today's plan is empty".into()))?;
    let conn = db.0.lock().unwrap();
    let today = Local::now().date_naive();
    let today_string = today.to_string();
    let practiced: u32 = conn.query_row(
        "SELECT COUNT(DISTINCT a.problem_id) FROM attempts a JOIN problems p ON p.id=a.problem_id WHERE a.completed_at IS NOT NULL AND p.is_curriculum=1",
        [], |row| row.get(0)
    )?;
    let reviews_due: u32 = conn.query_row(
        "SELECT COUNT(*) FROM reviews WHERE next_review_date<=?",
        [&today_string],
        |row| row.get(0),
    )?;
    let overdue_cutoff = (today - Duration::days(3)).to_string();
    let significantly_overdue: u32 = conn.query_row(
        "SELECT COUNT(*) FROM reviews WHERE next_review_date<=?",
        [&overdue_cutoff],
        |row| row.get(0),
    )?;
    let last_practice: Option<String> = conn.query_row(
        "SELECT MAX(date) FROM daily_activity WHERE attempts_completed>0",
        [],
        |row| row.get(0),
    )?;
    let days_since_practice = last_practice
        .and_then(|date| chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d").ok())
        .map(|date| (today - date).num_days().max(0));
    let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let mut week = Vec::with_capacity(7);
    for offset in 0..7 {
        let day = (monday + Duration::days(offset)).to_string();
        week.push(conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM daily_activity WHERE date=? AND (goal_completed=1 OR attempts_completed>0))",
            [day], |row| row.get(0)
        )?);
    }
    let recent_takeaway: Option<String> = conn.query_row(
        "SELECT NULLIF(trim(notes),'') FROM attempts WHERE completed_at IS NOT NULL AND trim(notes)<>'' ORDER BY completed_at DESC LIMIT 1",
        [], |row| row.get(0)
    ).optional()?.flatten();
    Ok(GardenState {
        unique_problems_practiced: practiced,
        current_stage: garden_stage_for(practiced),
        vitality: garden_vitality_for(days_since_practice, reviews_due, significantly_overdue),
        reviews_due,
        current_streak: plan.streak.max(0) as u32,
        weekly_days_completed: week.iter().filter(|done| **done).count() as u8,
        week,
        today_problem,
        recent_takeaway,
    })
}

#[cfg(test)]
mod domain_tests {
    use super::*;

    #[test]
    fn stage_boundaries_are_stable() {
        assert_eq!(garden_stage_for(0), GardenStage::OpenField);
        assert_eq!(garden_stage_for(10), GardenStage::OpenField);
        assert_eq!(garden_stage_for(11), GardenStage::YoungGrove);
        assert_eq!(garden_stage_for(30), GardenStage::YoungGrove);
        assert_eq!(garden_stage_for(31), GardenStage::Meadow);
        assert_eq!(garden_stage_for(61), GardenStage::Homestead);
        assert_eq!(garden_stage_for(91), GardenStage::Valley);
        assert_eq!(garden_stage_for(121), GardenStage::Countryside);
        assert_eq!(garden_stage_for(150), GardenStage::Countryside);
    }

    #[test]
    fn vitality_is_encouraging_and_deterministic() {
        assert_eq!(garden_vitality_for(Some(0), 0, 0), GardenVitality::Thriving);
        assert_eq!(garden_vitality_for(Some(3), 2, 0), GardenVitality::Calm);
        assert_eq!(
            garden_vitality_for(Some(1), 5, 0),
            GardenVitality::NeedsCare
        );
        assert_eq!(
            garden_vitality_for(Some(1), 3, 3),
            GardenVitality::NeedsCare
        );
        assert_eq!(garden_vitality_for(None, 0, 0), GardenVitality::NeedsCare);
    }

    #[test]
    fn review_schedule_advances_and_recedes_with_mastery() {
        assert_eq!(review_schedule(0, "Solved", 4), (1, 3));
        assert_eq!(review_schedule(1, "Easy", 5), (4, 30));
        assert_eq!(review_schedule(4, "Struggled", 4), (3, 14));
        assert_eq!(review_schedule(4, "Needed hint", 2), (1, 3));
        assert_eq!(review_schedule(6, "Couldn't solve", 5), (0, 1));
    }

    #[test]
    fn review_schedule_is_clamped_to_supported_intervals() {
        assert_eq!(review_schedule(6, "Easy", 5), (6, 120));
        assert_eq!(review_schedule(0, "Needed hint", 1), (0, 1));
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

pub fn get_active_attempt(db: State<Db>) -> AppResult<Option<ActiveAttempt>> {
    let conn = db.0.lock().unwrap();
    query_active_attempt_row(&conn)?
        .map(|row| hydrate_active_attempt(&conn, row))
        .transpose()
}

#[tauri::command]
pub fn start_attempt(
    problem_id: String,
    is_review: bool,
    db: State<Db>,
) -> AppResult<ActiveAttempt> {
    let conn = db.0.lock().unwrap();
    let problem = query_problem(&conn, &problem_id)?;
    if let Some(row) = query_active_attempt_row(&conn)? {
        if row.1 == problem_id {
            return Ok(ActiveAttempt {
                id: row.0,
                problem,
                started_at: row.2,
                paused_at: row.3,
                paused_seconds: row.4,
                notes: row.5,
                is_review: row.6,
            });
        }
        return Err(AppError::Message(
            "Another focus session is active. Resume or end it before starting a new problem."
                .into(),
        ));
    }
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO attempts(problem_id,started_at,is_review) VALUES(?,?,?)",
        params![problem_id, now, is_review],
    )?;
    let id = conn.last_insert_rowid();
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
    let conn = db.0.lock().unwrap();
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
    db.0.lock().unwrap().execute(
        "UPDATE attempts SET abandoned_at=?,paused_at=NULL WHERE id=? AND completed_at IS NULL AND abandoned_at IS NULL",
        params![Utc::now().to_rfc3339(),attempt_id]
    )?;
    Ok(())
}

#[tauri::command]
pub fn finish_attempt(input: FinishAttemptInput, db: State<Db>) -> AppResult<JournalEntry> {
    validate_finish_input(&input)?;
    let mut conn = db.0.lock().unwrap();
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
    let start = chrono::DateTime::parse_from_rfc3339(&started_at)
        .map_err(|e| AppError::Message(e.to_string()))?;
    let current_pause_seconds = paused_at
        .map(|value| {
            chrono::DateTime::parse_from_rfc3339(&value)
                .map(|paused| (now - paused.with_timezone(&Utc)).num_seconds())
                .map_err(|error| AppError::Message(error.to_string()))
        })
        .transpose()?
        .unwrap_or(0);
    let duration =
        ((now - start.with_timezone(&Utc)).num_seconds() - paused_seconds - current_pause_seconds)
            .max(0);
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
    let current_review_level: i32 = tx
        .query_row(
            "SELECT review_level FROM reviews WHERE problem_id=?",
            [&problem_id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0);
    let (next_review_level, days) =
        review_schedule(current_review_level, &input.outcome, input.confidence);
    let next = (Local::now().date_naive() + Duration::days(days)).to_string();
    tx.execute("INSERT INTO reviews(problem_id,next_review_date,review_level,last_reviewed_at) VALUES(?,?,?,?) ON CONFLICT(problem_id) DO UPDATE SET next_review_date=excluded.next_review_date,review_level=excluded.review_level,last_reviewed_at=excluded.last_reviewed_at",params![problem_id,next,next_review_level,now.to_rfc3339()])?;
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
    let problem = query_problem(&conn, &problem_id)?;
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

#[tauri::command]
pub fn get_review_queue(db: State<Db>) -> AppResult<Vec<ReviewItem>> {
    let conn = db.0.lock().unwrap();
    query_reviews(&conn, None, None)
}

#[tauri::command]
pub fn get_settings(db: State<Db>) -> AppResult<AppSettings> {
    Ok(read_settings(&db.0.lock().unwrap()))
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, db: State<Db>) -> AppResult<AppSettings> {
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
pub fn get_focus_context(db: State<Db>) -> AppResult<Option<FocusContext>> {
    let attempt = match get_active_attempt(db.clone())? {
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

fn title_from_slug(slug: &str) -> String {
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

#[tauri::command]
pub fn get_book_problems(book_id: String, db: State<Db>) -> AppResult<Vec<ProblemOverview>> {
    let conn = db.0.lock().unwrap();
    let today = Local::now().date_naive().to_string();
    let mut stmt=conn.prepare("SELECT p.id,p.title,p.category,p.difficulty,p.leetcode_url,p.neetcode_url,i.order_index,p.category_order,
      COUNT(a.id),(SELECT outcome FROM attempts la WHERE la.problem_id=p.id AND la.completed_at IS NOT NULL ORDER BY la.completed_at DESC LIMIT 1),
      (SELECT completed_at FROM attempts la WHERE la.problem_id=p.id AND la.completed_at IS NOT NULL ORDER BY la.completed_at DESC LIMIT 1),r.next_review_date
      FROM problem_book_items i JOIN problems p ON p.id=i.problem_id LEFT JOIN attempts a ON a.problem_id=p.id AND a.completed_at IS NOT NULL LEFT JOIN reviews r ON r.problem_id=p.id
      WHERE i.book_id=? GROUP BY p.id ORDER BY i.order_index")?;
    let problems = stmt
        .query_map([book_id], |r| {
            let count: i32 = r.get(8)?;
            let last: Option<String> = r.get(9)?;
            let review: Option<String> = r.get(11)?;
            let status = if review.as_ref().is_some_and(|d| d <= &today) {
                "Review Due"
            } else if count == 0 {
                "Unseen"
            } else if last.as_ref().is_some_and(|o| o == "Easy" || o == "Solved") {
                "Solved"
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
                next_review_date: review,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(problems)
}

const LM_STUDIO_BASE_URL: &str = "http://127.0.0.1:1234";

#[derive(Default)]
pub struct QwenRuntime {
    loaded: AsyncMutex<Option<String>>,
    control: Mutex<QwenControl>,
}

#[derive(Default)]
struct QwenControl {
    abort: Option<AbortHandle>,
    releasing: usize,
}

// Block new requests until all pending releases finish, including a release
// queued while LM Studio is still loading the model.
struct QwenRelease<'a>(&'a QwenRuntime);

impl Drop for QwenRelease<'_> {
    fn drop(&mut self) {
        self.0.control.lock().unwrap().releasing -= 1;
    }
}

impl QwenRuntime {
    fn begin_request(
        &self,
    ) -> AppResult<(
        futures_util::lock::MutexGuard<'_, Option<String>>,
        futures_util::future::AbortRegistration,
    )> {
        let mut control = self.control.lock().unwrap();
        if control.releasing > 0 {
            return Err(AppError::Message(
                "Qwen is being released. Try again in a moment.".into(),
            ));
        }
        let loaded = self.loaded.try_lock().ok_or_else(|| {
            AppError::Message(
                "Qwen is already answering. Stop that response before asking again.".into(),
            )
        })?;
        let (abort, registration) = AbortHandle::new_pair();
        control.abort = Some(abort);
        Ok((loaded, registration))
    }

    fn begin_release(&self) -> QwenRelease<'_> {
        let mut control = self.control.lock().unwrap();
        control.releasing += 1;
        if let Some(abort) = &control.abort {
            abort.abort();
        }
        QwenRelease(self)
    }
}

#[cfg(test)]
mod qwen_lifecycle_tests {
    use super::*;

    #[test]
    fn leaving_during_load_waits_for_instance_and_prevents_inference() {
        tauri::async_runtime::block_on(async {
            let runtime = QwenRuntime::default();
            let (mut loading, registration) = runtime.begin_request().unwrap();
            assert!(runtime.begin_request().is_err());
            let release = runtime.begin_release();
            assert!(runtime.begin_request().is_err());
            let mut pending_release = Box::pin(runtime.loaded.lock());
            assert!(futures_util::poll!(&mut pending_release).is_pending());

            // LM Studio completes a load after the user has already left.
            *loading = Some("qwen-test-instance".into());
            let mut inference_started = false;
            let result = Abortable::new(async { inference_started = true }, registration).await;
            assert!(result.is_err());
            assert!(!inference_started);
            drop(loading);

            let mut loaded = pending_release.await;
            assert_eq!(loaded.as_deref(), Some("qwen-test-instance"));
            *loaded = None;
            drop(loaded);
            drop(release);
            assert!(runtime.begin_request().is_ok());
        });
    }

    #[test]
    fn multiple_releases_keep_new_requests_blocked_until_all_finish() {
        let runtime = QwenRuntime::default();
        let first = runtime.begin_release();
        let second = runtime.begin_release();
        drop(first);
        assert!(runtime.begin_request().is_err());
        drop(second);
        assert!(runtime.begin_request().is_ok());
    }
}

#[derive(serde::Deserialize)]
struct LmModelCatalog {
    models: Vec<LmModel>,
}

#[derive(serde::Deserialize)]
struct LmModel {
    #[serde(rename = "type")]
    model_type: String,
    key: String,
    display_name: String,
    params_string: Option<String>,
    selected_variant: Option<String>,
    loaded_instances: Vec<LmLoadedInstance>,
}

#[derive(serde::Deserialize)]
struct LmLoadedInstance {
    id: String,
}

#[derive(serde::Deserialize)]
struct LmLoadResponse {
    instance_id: String,
}

fn is_qwen_35_4b(model: &LmModel) -> bool {
    let identity = format!(
        "{} {} {} {}",
        model.key,
        model.display_name,
        model.params_string.as_deref().unwrap_or_default(),
        model.selected_variant.as_deref().unwrap_or_default()
    )
    .to_lowercase();
    model.model_type == "llm"
        && identity.contains("qwen")
        && (identity.contains("3.5") || identity.contains("3_5") || identity.contains("qwen3.5"))
        && (identity.contains("4b") || identity.contains("4-b") || identity.contains("4 b"))
}

async fn qwen_instance(client: &reqwest::Client, loaded: &mut Option<String>) -> AppResult<String> {
    let catalog = client
        .get(format!("{LM_STUDIO_BASE_URL}/api/v1/models"))
        .send()
        .await
        .map_err(|_| AppError::Message("LM Studio is not running. Start its local server on port 1234, then try @qwen again.".into()))?
        .error_for_status()
        .map_err(|error| AppError::Message(format!("LM Studio model lookup failed: {error}")))?
        .json::<LmModelCatalog>()
        .await
        .map_err(|error| AppError::Message(format!("LM Studio returned an unreadable model list: {error}")))?;
    let model = catalog.models.into_iter().find(is_qwen_35_4b).ok_or_else(|| {
        AppError::Message("Qwen 3.5 4B is not downloaded in LM Studio. LeetJournal will not fall back to another model; download 4B and try again.".into())
    })?;

    let instance_id = if let Some(loaded) = model.loaded_instances.into_iter().next() {
        loaded.id
    } else {
        let model_key = model.key;
        client
            .post(format!("{LM_STUDIO_BASE_URL}/api/v1/models/load"))
            .json(&serde_json::json!({
                "model": model_key,
                "context_length": 8192,
                "flash_attention": true
            }))
            .send()
            .await
            .map_err(|error| AppError::Message(format!("Could not load Qwen 3.5 4B: {error}")))?
            .error_for_status()
            .map_err(|error| {
                AppError::Message(format!("LM Studio could not load Qwen 3.5 4B: {error}"))
            })?
            .json::<LmLoadResponse>()
            .await
            .map_err(|error| {
                AppError::Message(format!(
                    "LM Studio returned an unreadable load response: {error}"
                ))
            })?
            .instance_id
    };
    *loaded = Some(instance_id.clone());
    Ok(instance_id)
}

fn leetcode_webview(app: &AppHandle, label: &str) -> AppResult<tauri::Webview> {
    if !label.starts_with("leetcode-workspace-") {
        return Err(AppError::Message("Invalid LeetCode workspace".into()));
    }
    app.get_webview(label)
        .ok_or_else(|| AppError::Message("The LeetCode workspace is not ready yet.".into()))
}

fn ensure_leetcode_page(webview: &tauri::Webview) -> AppResult<()> {
    let url = webview
        .url()
        .map_err(|error| AppError::Message(error.to_string()))?;
    if url.scheme() == "https"
        && matches!(url.host_str(), Some("leetcode.com" | "www.leetcode.com"))
    {
        return Ok(());
    }
    Err(AppError::Message(
        "Editor context is only available from LeetCode.".into(),
    ))
}

#[tauri::command]
pub async fn get_leetcode_editor_code(webview_label: String, app: AppHandle) -> AppResult<String> {
    let webview = leetcode_webview(&app, &webview_label)?;
    ensure_leetcode_page(&webview)?;
    let script = r#"(()=>{try{const models=window.monaco?.editor?.getModels?.()||[];const values=models.map(m=>m.getValue?.()||'').filter(Boolean);if(values.length)return values.sort((a,b)=>b.length-a.length)[0];const textareas=[...document.querySelectorAll('.monaco-editor textarea, textarea[data-mode-id], textarea')];const candidate=textareas.map(x=>x.value||'').filter(x=>x.trim().length>20).sort((a,b)=>b.length-a.length)[0];return candidate||''}catch(e){return ''}})()"#;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    webview
        .eval_with_callback(script, move |result| {
            let _ = sender.send(result);
        })
        .map_err(|e| AppError::Message(format!("Could not read the LeetCode editor: {e}")))?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(std::time::Duration::from_secs(3))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
    .map_err(|_| AppError::Message("Timed out while reading the LeetCode editor.".into()))?;
    Ok(serde_json::from_str::<String>(&result).unwrap_or_default())
}

#[tauri::command]
pub fn set_focus_shortcut_enabled(
    enabled: bool,
    shortcut: State<crate::FocusShortcut>,
) -> AppResult<()> {
    shortcut
        .enabled
        .store(enabled, std::sync::atomic::Ordering::Relaxed);
    shortcut
        .item
        .set_enabled(enabled)
        .map_err(|error| AppError::Message(error.to_string()))
}

#[cfg(target_os = "macos")]
fn clip_leetcode_webview(webview: &tauri::Webview) -> AppResult<()> {
    webview
        .with_webview(|platform| unsafe {
            let view: &objc2_app_kit::NSView = &*platform.inner().cast();
            view.setWantsLayer(true);
            if let Some(layer) = view.layer() {
                layer.setCornerRadius(12.0);
                layer.setMasksToBounds(true);
            }
        })
        .map_err(|error| AppError::Message(error.to_string()))
}

#[cfg(not(target_os = "macos"))]
fn clip_leetcode_webview(_webview: &tauri::Webview) -> AppResult<()> {
    Ok(())
}

#[tauri::command]
pub fn set_leetcode_webview_bounds(
    app: AppHandle,
    webview_label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> AppResult<()> {
    if !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width < 1.0
        || height < 1.0
    {
        return Err(AppError::Message("Invalid workspace bounds".into()));
    }
    let webview = leetcode_webview(&app, &webview_label)?;
    clip_leetcode_webview(&webview)?;
    webview
        .set_bounds(tauri::Rect {
            position: tauri::LogicalPosition::new(x, y).into(),
            size: tauri::LogicalSize::new(width, height).into(),
        })
        .map_err(|error| AppError::Message(error.to_string()))
}

#[tauri::command]
pub async fn ask_qwen(
    prompt: String,
    on_token: Channel<String>,
    runtime: State<'_, QwenRuntime>,
) -> AppResult<()> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err(AppError::Message("Type a question after @qwen".into()));
    }
    if prompt.len() > 100_000 {
        return Err(AppError::Message(
            "That Qwen request is too large. Keep it under 100 KB.".into(),
        ));
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| {
            AppError::Message(format!("Could not create the local AI client: {error}"))
        })?;
    let (mut loaded, registration) = runtime.begin_request()?;
    // Finish loading before release; cancelling the HTTP load can leave an
    // instance loading in LM Studio without returning its identifier to us.
    let result = match qwen_instance(&client, &mut loaded).await {
        Ok(instance_id) => Abortable::new(
            stream_qwen(&client, &instance_id, prompt, &on_token),
            registration,
        )
        .await
        .unwrap_or(Ok(())),
        Err(error) => Err(error),
    };
    runtime.control.lock().unwrap().abort = None;
    result
}

async fn stream_qwen(
    client: &reqwest::Client,
    instance_id: &str,
    prompt: &str,
    on_token: &Channel<String>,
) -> AppResult<()> {
    let response = client
        .post(format!("{LM_STUDIO_BASE_URL}/api/v1/chat"))
        .json(&serde_json::json!({
            "model": instance_id,
            "input": prompt,
            "temperature": 0.4,
            "max_output_tokens": 768,
            "reasoning": "off",
            "stream": true
        }))
        .send()
        .await
        .map_err(|error| AppError::Message(format!("Could not start Qwen inference: {error}")))?
        .error_for_status()
        .map_err(|error| AppError::Message(format!("Qwen inference failed: {error}")))?;
    let mut stream = response.bytes_stream();
    let mut decoder = crate::qwen_stream::QwenStream::default();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|error| AppError::Message(format!("Qwen stream interrupted: {error}")))?;
        if decoder.push(&chunk, |token| {
            on_token
                .send(token)
                .map_err(|error| AppError::Message(error.to_string()))
        })? {
            return Ok(());
        }
    }
    Err(AppError::Message(
        "Qwen disconnected before finishing. Your partial response is kept; try again.".into(),
    ))
}

#[tauri::command]
pub fn stop_qwen(runtime: State<'_, QwenRuntime>) {
    if let Some(abort) = &runtime.control.lock().unwrap().abort {
        abort.abort();
    }
}

#[tauri::command]
pub async fn unload_qwen(runtime: State<'_, QwenRuntime>) -> AppResult<()> {
    let _release = runtime.begin_release();
    let mut loaded = runtime.loaded.lock().await;
    let Some(instance_id) = loaded.as_ref() else {
        return Ok(());
    };
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|error| AppError::Message(error.to_string()))?
        .post(format!("{LM_STUDIO_BASE_URL}/api/v1/models/unload"))
        .json(&serde_json::json!({ "instance_id": instance_id }))
        .send()
        .await;

    match response {
        Ok(response) if response.status().is_success() || response.status().as_u16() == 404 => {
            *loaded = None;
            Ok(())
        }
        Ok(response) => Err(AppError::Message(format!(
            "LM Studio could not unload Qwen: HTTP {}",
            response.status()
        ))),
        Err(error) if error.is_connect() => {
            *loaded = None;
            Ok(())
        }
        Err(error) => Err(AppError::Message(format!(
            "Could not unload Qwen from LM Studio: {error}"
        ))),
    }
}
