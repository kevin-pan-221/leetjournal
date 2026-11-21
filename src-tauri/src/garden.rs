//! A derived collection, not a second ledger: journal edits and repeated reads
//! cannot award extra plants. Existing recorded durations automatically count.
use crate::{
    error::AppResult,
    models::{GardenPlant, GardenState},
};
use rusqlite::Connection;

const BLOOM_SECONDS: i64 = 75 * 60;

pub fn read_garden(conn: &Connection) -> AppResult<GardenState> {
    let mut query = conn.prepare(
        "SELECT MAX(0, COALESCE(a.duration_seconds, 0)),
         COALESCE(a.completed_at, a.abandoned_at), p.title
         FROM attempts a JOIN problems p ON p.id=a.problem_id
         WHERE a.completed_at IS NOT NULL OR a.abandoned_at IS NOT NULL
         ORDER BY COALESCE(a.completed_at, a.abandoned_at), a.id",
    )?;
    let records = query.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut state = GardenState {
        focused_seconds: 0,
        plants: Vec::new(),
    };
    let mut problems = Vec::new();
    for record in records {
        let (mut seconds, date, title) = record?;
        while seconds > 0 {
            if !problems.contains(&title) {
                problems.push(title.clone());
            }
            let credited = seconds.min(BLOOM_SECONDS - state.focused_seconds % BLOOM_SECONDS);
            state.focused_seconds += credited;
            seconds -= credited;
            if state.focused_seconds % BLOOM_SECONDS == 0 {
                state.plants.push(GardenPlant {
                    id: state.plants.len(),
                    grown_at: date.clone(),
                    problems: std::mem::take(&mut problems),
                });
            }
        }
    }
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE problems(id TEXT, title TEXT);
            INSERT INTO problems VALUES('a','Two Sum'),('b','Valid Anagram');
            CREATE TABLE attempts(id INTEGER PRIMARY KEY, problem_id TEXT, duration_seconds INTEGER,
            completed_at TEXT, abandoned_at TEXT, started_at TEXT, paused_at TEXT,
            paused_seconds INTEGER DEFAULT 0, is_review INTEGER DEFAULT 0, outcome TEXT);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn existing_history_short_sessions_reviews_and_unsolved_all_count() {
        let conn = fixture();
        conn.execute_batch(
            "INSERT INTO attempts(id,problem_id,duration_seconds,completed_at,outcome)
            VALUES(1,'a',1499,'2026-10-01','Couldn''t solve'),(2,'a',1,'2026-10-02','Solved');
            INSERT INTO attempts(id,problem_id,duration_seconds,completed_at,is_review)
            VALUES(3,'b',3000,'2026-10-03',1);",
        )
        .unwrap();
        let garden = read_garden(&conn).unwrap();
        assert_eq!(garden.focused_seconds, 4500);
        assert_eq!(garden.plants.len(), 1);
        assert_eq!(garden.plants[0].problems, ["Two Sum", "Valid Anagram"]);
        assert_eq!(garden.plants[0].grown_at, "2026-10-03");
        conn.execute("UPDATE attempts SET outcome='Easy'", [])
            .unwrap();
        assert_eq!(read_garden(&conn).unwrap().focused_seconds, 4500);
    }

    #[test]
    fn carries_remainder_and_handles_multiple_blooms_in_one_attempt() {
        let conn = fixture();
        conn.execute_batch(
            "INSERT INTO attempts(id,problem_id,duration_seconds,completed_at)
            VALUES(1,'a',9100,'2026-10-01');",
        )
        .unwrap();
        let garden = read_garden(&conn).unwrap();
        assert_eq!(garden.focused_seconds, 9100);
        assert_eq!(garden.plants.len(), 2);
        assert_eq!(garden.plants[1].id, 1);
        assert_eq!(garden.plants[1].problems, ["Two Sum"]);
    }

    #[test]
    fn active_attempts_and_unknown_historical_durations_are_not_double_counted() {
        let conn = fixture();
        conn.execute_batch(
            "INSERT INTO attempts(id,problem_id,duration_seconds,completed_at,abandoned_at)
            VALUES(1,'a',8000,NULL,NULL),(2,'a',NULL,NULL,'2026-10-01'),
            (3,'a',-500,'2026-10-01',NULL),(4,'b',200,NULL,'2026-10-01');",
        )
        .unwrap();
        let garden = read_garden(&conn).unwrap();
        assert_eq!(garden.focused_seconds, 200);
        assert!(garden.plants.is_empty());
    }

    #[test]
    fn ending_paused_attempt_preserves_time_and_is_idempotent() {
        let mut conn = fixture();
        conn.execute_batch(
            "INSERT INTO attempts(id,problem_id,started_at,paused_at,paused_seconds)
            VALUES(1,'a','2026-10-01T10:00:00Z','2026-10-01T10:30:00Z',300);",
        )
        .unwrap();
        let now = "2026-10-01T11:00:00Z".parse().unwrap();
        crate::commands::abandon_attempt_in_db(&mut conn, 1, now).unwrap();
        crate::commands::abandon_attempt_in_db(&mut conn, 1, now).unwrap();
        assert_eq!(read_garden(&conn).unwrap().focused_seconds, 1500);
        let completed: Option<String> = conn
            .query_row("SELECT completed_at FROM attempts", [], |r| r.get(0))
            .unwrap();
        assert!(completed.is_none());
    }

    #[test]
    fn ending_running_attempt_saves_time_but_cannot_change_a_completed_attempt() {
        let mut conn = fixture();
        conn.execute_batch(
            "INSERT INTO attempts(id,problem_id,started_at,paused_seconds)
            VALUES(1,'a','2026-10-01T10:00:00Z',60);
            INSERT INTO attempts(id,problem_id,duration_seconds,completed_at)
            VALUES(2,'b',200,'2026-10-01T10:00:00Z');",
        )
        .unwrap();
        let now = "2026-10-01T10:05:00Z".parse().unwrap();
        crate::commands::abandon_attempt_in_db(&mut conn, 1, now).unwrap();
        crate::commands::abandon_attempt_in_db(&mut conn, 2, now).unwrap();
        assert_eq!(read_garden(&conn).unwrap().focused_seconds, 440);
        let abandoned: Option<String> = conn
            .query_row("SELECT abandoned_at FROM attempts WHERE id=2", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(abandoned.is_none());
    }
}
