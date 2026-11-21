mod rules;

use crate::{
    db::Db,
    error::{AppError, AppResult},
};
use rules::{level_at, xp_at, Enchantment};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use tauri::State;

const KINDS: [&str; 6] = [
    "boots",
    "helmet",
    "leggings",
    "chestplate",
    "pickaxe",
    "sword",
];
const ARMOR: [&str; 4] = ["helmet", "chestplate", "leggings", "boots"];
const PROGRESS_VERSION: u32 = 4;
const SOLVE_XP: i64 = 20;
const REVIEW_XP: i64 = 10;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextReward {
    kind: String,
    material: String,
    xp_required: i64,
}

fn reward_item(index: i64, id: u32, date: &str) -> Item {
    // Chainmail is armor-only; tools enter with the iron tier.
    let (kind, material) = if index < 4 {
        (KINDS[index as usize], "chainmail")
    } else {
        (
            KINDS[(index as usize - 4) % KINDS.len()],
            if index < 10 { "iron" } else { "diamond" },
        )
    };
    Item {
        id,
        kind: kind.into(),
        material: material.into(),
        enchantments: vec![],
        earned_at: date.into(),
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    id: u32,
    kind: String,
    material: String,
    enchantments: Vec<Enchantment>,
    earned_at: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    version: u32,
    xp: i64,
    lifetime_xp: i64,
    crystals: i64,
    seed: u64,
    revision: u32,
    items: Vec<Item>,
    equipped: BTreeMap<String, u32>,
    problems: BTreeSet<String>,
    reviews: BTreeSet<String>,
}

fn ensure_leather_armor(p: &mut Progress) {
    for kind in ARMOR {
        let id = if let Some(item) = p
            .items
            .iter()
            .find(|i| i.kind == kind && i.material == "leather")
        {
            item.id
        } else {
            let id = p.items.iter().map(|i| i.id).max().map_or(0, |id| id + 1);
            p.items.push(Item {
                id,
                kind: kind.into(),
                material: "leather".into(),
                enchantments: vec![],
                earned_at: "Starter equipment".into(),
            });
            id
        };
        // Never replace a piece already chosen for this slot.
        p.equipped.entry(kind.into()).or_insert(id);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    slot: usize,
    required_level: u32,
    level_cost: u32,
    crystal_cost: u32,
    glyph_seed: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyState {
    xp: i64,
    lifetime_xp: i64,
    level: u32,
    level_progress: i64,
    level_size: i64,
    crystals: i64,
    shelves: u32,
    solved_problems: usize,
    revision: u32,
    items: Vec<Item>,
    equipped: BTreeMap<String, u32>,
    offers: Vec<Offer>,
    next_reward: NextReward,
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS study_state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS study_credits(attempt_id INTEGER PRIMARY KEY, xp INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS study_reward_backups(version INTEGER PRIMARY KEY, payload TEXT NOT NULL, credits TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);")?;
    Ok(())
}

fn load(tx: &Transaction<'_>) -> AppResult<Progress> {
    let payload: Option<String> = tx
        .query_row("SELECT payload FROM study_state WHERE id=1", [], |r| {
            r.get(0)
        })
        .optional()?;
    if let Some(payload) = payload {
        let progress: Progress = serde_json::from_str(&payload)?;
        if progress.version > PROGRESS_VERSION || progress.version == 0 {
            return Err(AppError::Message(
                "This study was saved by a newer app version.".into(),
            ));
        }
        if progress.version < PROGRESS_VERSION {
            // Archive the complete old reward state before rebuilding from solves.
            // This shares the caller's transaction with replay and save, so failure
            // cannot leave a cleared ledger or a partially migrated collection.
            tx.execute(
                "INSERT OR IGNORE INTO study_reward_backups(version,payload,credits)
                 SELECT ?,?,json_group_array(json_object('attemptId',attempt_id,'xp',xp)) FROM study_credits",
                params![progress.version, payload],
            )?;
            tx.execute("DELETE FROM study_credits", [])?;
            return Ok(new_progress(
                progress.seed,
                progress.revision.wrapping_add(1),
            ));
        }
        return Ok(progress);
    }
    let seed: i64 = tx.query_row("SELECT random()", [], |r| r.get(0))?;
    Ok(new_progress(seed as u64, 0))
}

fn new_progress(seed: u64, revision: u32) -> Progress {
    let mut progress = Progress {
        version: PROGRESS_VERSION,
        xp: 0,
        lifetime_xp: 0,
        crystals: 0,
        seed,
        revision,
        equipped: BTreeMap::new(),
        items: vec![],
        problems: BTreeSet::new(),
        reviews: BTreeSet::new(),
    };
    ensure_leather_armor(&mut progress);
    progress
}

fn sync(tx: &Transaction<'_>, progress: &mut Progress) -> AppResult<()> {
    let mut query = tx.prepare("SELECT a.id,a.problem_id,a.completed_at,COALESCE(a.completed_at,a.abandoned_at),a.is_review,COALESCE(a.outcome,'')
        FROM attempts a WHERE (a.completed_at IS NOT NULL OR a.abandoned_at IS NOT NULL)
        AND NOT EXISTS(SELECT 1 FROM study_credits c WHERE c.attempt_id=a.id)
        ORDER BY julianday(COALESCE(a.completed_at,a.abandoned_at)),a.id")?;
    let rows = query.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, bool>(4)?,
            r.get::<_, String>(5)?,
        ))
    })?;
    for row in rows {
        let (id, problem, completed, date, review, outcome) = row?;
        let mut xp = 0;
        if completed.is_some() && matches!(outcome.as_str(), "Solved" | "Easy") {
            // Normalize offsets before applying the daily cap. Durations are
            // deliberately not queried: idle time can never earn any currency.
            let day = chrono::DateTime::parse_from_rfc3339(&date)
                .map(|d| d.with_timezone(&chrono::Utc).date_naive().to_string())
                .unwrap_or_else(|_| date.get(..10).unwrap_or(&date).to_owned());
            let first_solve = progress.problems.insert(problem.clone());
            let first_today = progress.reviews.insert(format!("{problem}:{day}"));
            xp = if first_solve {
                SOLVE_XP
            } else if review && first_today {
                REVIEW_XP
            } else {
                0
            };
            if xp > 0 {
                progress.crystals += 1;
            }
        }
        let old_rewards = progress.lifetime_xp / 100;
        progress.xp += xp;
        progress.lifetime_xp += xp;
        // Lifetime XP unlocks gear; spending levels never takes it away.
        for reward in old_rewards..progress.lifetime_xp / 100 {
            let next_id = progress
                .items
                .iter()
                .map(|i| i.id)
                .max()
                .map_or(0, |id| id + 1);
            let item = reward_item(reward, next_id, &date);
            // Fill an empty slot, but never replace a user's chosen equipment.
            progress
                .equipped
                .entry(item.kind.clone())
                .or_insert(item.id);
            progress.items.push(item);
        }
        tx.execute(
            "INSERT INTO study_credits(attempt_id,xp) VALUES(?,?)",
            params![id, xp],
        )?;
    }
    Ok(())
}

fn save(tx: &Transaction<'_>, progress: &Progress) -> AppResult<()> {
    tx.execute("INSERT INTO study_state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",[serde_json::to_string(progress)?])?;
    Ok(())
}

fn view(p: Progress) -> StudyState {
    let next = reward_item(p.lifetime_xp / 100, 0, "");
    let level = level_at(p.xp);
    let shelves = (p.problems.len() / 5).min(15) as u32;
    let offers = rules::requirements(p.seed, shelves)
        .into_iter()
        .enumerate()
        .map(|(slot, required_level)| Offer {
            slot,
            required_level,
            level_cost: slot as u32 + 1,
            crystal_cost: slot as u32 + 1,
            // Display seed is separate from the undisclosed enchantment seed.
            glyph_seed: p
                .revision
                .wrapping_mul(7919)
                .wrapping_add(slot as u32 * 97 + 31),
        })
        .collect();
    StudyState {
        xp: p.xp,
        lifetime_xp: p.lifetime_xp,
        level,
        level_progress: p.xp - xp_at(level),
        level_size: xp_at(level + 1) - xp_at(level),
        crystals: p.crystals,
        shelves,
        solved_problems: p.problems.len(),
        revision: p.revision,
        items: p.items,
        equipped: p.equipped,
        offers,
        next_reward: NextReward {
            kind: next.kind,
            material: next.material,
            xp_required: 100 - p.lifetime_xp % 100,
        },
    }
}

pub fn read(conn: &mut Connection) -> AppResult<StudyState> {
    let tx = conn.transaction()?;
    let mut progress = load(&tx)?;
    sync(&tx, &mut progress)?;
    save(&tx, &progress)?;
    tx.commit()?;
    Ok(view(progress))
}

fn enchant(
    conn: &mut Connection,
    item_id: u32,
    slot: usize,
    revision: u32,
) -> AppResult<StudyState> {
    let tx = conn.transaction()?;
    let mut p = load(&tx)?;
    sync(&tx, &mut p)?;
    if slot > 2 || p.revision != revision {
        return Err(AppError::Message(
            "The offers have changed. Select an enchantment again.".into(),
        ));
    }
    let item = p
        .items
        .iter_mut()
        .find(|i| i.id == item_id)
        .ok_or_else(|| AppError::Message("That item is not in your collection.".into()))?;
    if !item.enchantments.is_empty() {
        return Err(AppError::Message(
            "This item is already enchanted. Choose an unenchanted item.".into(),
        ));
    }
    let power = rules::requirements(p.seed, (p.problems.len() / 5).min(15) as u32)[slot];
    let cost = slot as u32 + 1;
    if level_at(p.xp) < power || p.crystals < i64::from(cost) {
        return Err(AppError::Message(
            "You need more levels or lapis for this offer.".into(),
        ));
    }
    item.enchantments = rules::roll(
        p.seed.wrapping_add(u64::from(item_id) * 31 + slot as u64),
        &item.kind,
        &item.material,
        power,
    );
    if item.enchantments.is_empty() {
        return Err(AppError::Message("This item cannot be enchanted.".into()));
    }
    p.xp = rules::spend_levels(p.xp, cost);
    p.crystals -= i64::from(cost);
    rules::random(&mut p.seed);
    p.revision += 1;
    save(&tx, &p)?;
    tx.commit()?;
    Ok(view(p))
}

fn equip(conn: &mut Connection, item_id: u32) -> AppResult<StudyState> {
    let tx = conn.transaction()?;
    let mut p = load(&tx)?;
    sync(&tx, &mut p)?;
    let item = p
        .items
        .iter()
        .find(|i| i.id == item_id)
        .ok_or_else(|| AppError::Message("That item is not in your collection.".into()))?;
    p.equipped.insert(item.kind.clone(), item_id);
    save(&tx, &p)?;
    tx.commit()?;
    Ok(view(p))
}

#[tauri::command]
pub fn get_study(db: State<'_, Db>) -> AppResult<StudyState> {
    let mut conn =
        db.0.lock()
            .map_err(|_| AppError::Message("Study storage is busy.".into()))?;
    read(&mut conn)
}
#[tauri::command]
pub fn enchant_study_item(
    db: State<'_, Db>,
    item_id: u32,
    slot: usize,
    revision: u32,
) -> AppResult<StudyState> {
    let mut conn =
        db.0.lock()
            .map_err(|_| AppError::Message("Study storage is busy.".into()))?;
    enchant(&mut conn, item_id, slot, revision)
}
#[tauri::command]
pub fn equip_study_item(db: State<'_, Db>, item_id: u32) -> AppResult<StudyState> {
    let mut conn =
        db.0.lock()
            .map_err(|_| AppError::Message("Study storage is busy.".into()))?;
    equip(&mut conn, item_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Connection {
        crate::db::test_connection()
    }
    fn history(conn: &Connection) {
        conn.execute("INSERT INTO attempts(problem_id,started_at,completed_at,duration_seconds,outcome)
            SELECT id,'2026-10-01','2026-10-01T12:00:00Z',0,'Solved' FROM problems ORDER BY order_index LIMIT 5",[]).unwrap();
    }
    #[test]
    fn new_users_start_in_leather_and_earn_upgrades_in_order() {
        let mut conn = fixture();
        let state = read(&mut conn).unwrap();
        assert_eq!(state.items.len(), 4);
        assert_eq!(state.equipped.len(), 4);
        assert!(state.items.iter().all(|i| i.material == "leather"));
        assert_eq!(state.next_reward.kind, "boots");
        assert_eq!(state.next_reward.material, "chainmail");
        assert_eq!(state.next_reward.xp_required, 100);
        history(&conn);
        let state = read(&mut conn).unwrap();
        assert_eq!(state.items.len(), 5);
        assert_eq!(state.items[4].kind, "boots");
        assert_eq!(state.items[4].material, "chainmail");
        // Unlocking does not silently replace the user's chosen equipment.
        assert_eq!(state.equipped["boots"], 3);
        assert_eq!(state.next_reward.kind, "helmet");
        assert_eq!(state.next_reward.xp_required, 100);
        assert_eq!(state.solved_problems, 5);
        assert_eq!(state.shelves, 1);
        assert_eq!(read(&mut conn).unwrap().items.len(), 5);
        assert_eq!(reward_item(3, 0, "").material, "chainmail");
        assert_eq!(reward_item(4, 0, "").material, "iron");
        assert_eq!(reward_item(9, 0, "").material, "iron");
        assert_eq!(reward_item(10, 0, "").material, "diamond");
        assert_eq!(reward_item(12, 0, "").material, "diamond");
        for index in 0..100 {
            let item = reward_item(index, 0, "");
            assert!(item.material != "chainmail" || ARMOR.contains(&item.kind.as_str()));
        }
    }
    #[test]
    fn legacy_rewards_are_archived_then_replayed_once_without_changing_history() {
        for version in [1, 2, 3] {
            let mut conn = fixture();
            history(&conn);
            let before: String = conn.query_row(
                "SELECT json_group_array(json_object('id',id,'outcome',outcome,'duration',duration_seconds)) FROM attempts", [], |r| r.get(0)).unwrap();
            let old_payload;
            {
                let tx = conn.transaction().unwrap();
                let mut p = load(&tx).unwrap();
                p.version = version;
                p.xp = 23000;
                p.lifetime_xp = 23435;
                p.crystals = 500;
                p.revision = 9;
                p.items.push(reward_item(10, 99, "2026-10-01"));
                p.items[4].enchantments.push(Enchantment {
                    name: "Unbreaking".into(),
                    level: 3,
                });
                p.equipped.insert("boots".into(), 99);
                old_payload = serde_json::to_string(&p).unwrap();
                save(&tx, &p).unwrap();
                tx.execute("INSERT INTO study_credits SELECT id,4000 FROM attempts", [])
                    .unwrap();
                tx.commit().unwrap();
            }
            let a = read(&mut conn).unwrap();
            let b = read(&mut conn).unwrap();
            assert_eq!(a.items.len(), 5);
            assert_eq!(b.items.len(), 5);
            assert!(a
                .items
                .iter()
                .all(|i| i.material != "diamond" && i.enchantments.is_empty()));
            assert_eq!(a.equipped["boots"], 3);
            assert_eq!(a.revision, b.revision);
            assert_eq!(a.revision, 10);
            assert_eq!(a.xp, 100);
            assert_eq!(a.lifetime_xp, 100);
            assert_eq!(a.crystals, 5);
            assert_eq!(a.equipped.len(), 4);
            let (backup, credits): (String, String) = conn
                .query_row(
                    "SELECT payload,credits FROM study_reward_backups WHERE version=?",
                    [version],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(backup, old_payload);
            let credits: serde_json::Value = serde_json::from_str(&credits).unwrap();
            assert_eq!(credits.as_array().unwrap().len(), 5);
            assert_eq!(credits[0]["xp"], 4000);
            let after: String = conn.query_row(
                "SELECT json_group_array(json_object('id',id,'outcome',outcome,'duration',duration_seconds)) FROM attempts", [], |r| r.get(0)).unwrap();
            assert_eq!(before, after);
        }
    }
    #[test]
    fn history_is_credited_once_and_journal_edits_cannot_farm_rewards() {
        let mut conn = fixture();
        history(&conn);
        let a = read(&mut conn).unwrap();
        let b = read(&mut conn).unwrap();
        assert_eq!(a.xp, 100);
        assert_eq!(a.crystals, 5);
        assert_eq!(a.xp, b.xp);
        conn.execute(
            "UPDATE attempts SET outcome='Easy',notes='edited',duration_seconds=740221",
            [],
        )
        .unwrap();
        assert_eq!(read(&mut conn).unwrap().xp, 100);
    }
    #[test]
    fn payment_and_enchantment_are_atomic_and_retries_cannot_charge_again() {
        let mut conn = fixture();
        history(&conn);
        let a = read(&mut conn).unwrap();
        let b = enchant(&mut conn, 0, 0, a.revision).unwrap();
        assert!(!b.items[0].enchantments.is_empty());
        assert_eq!(b.crystals, 4);
        assert!(enchant(&mut conn, 0, 0, a.revision).is_err());
        assert!(enchant(&mut conn, 1, 0, a.revision).is_err());
        assert_eq!(read(&mut conn).unwrap().xp, b.xp);
        assert!(enchant(&mut conn, 999, 0, b.revision).is_err());
    }
    #[test]
    fn insufficient_resources_and_invalid_slots_leave_state_unchanged() {
        let mut conn = fixture();
        let a = read(&mut conn).unwrap();
        assert!(enchant(&mut conn, 0, 0, a.revision).is_err());
        assert!(enchant(&mut conn, 0, 3, a.revision).is_err());
        assert_eq!(read(&mut conn).unwrap().xp, 0);
    }
    #[test]
    fn equip_is_persistent_and_cannot_equip_unknown_items() {
        let mut conn = fixture();
        history(&conn);
        let a = read(&mut conn).unwrap();
        let id = a.items.last().unwrap().id;
        equip(&mut conn, id).unwrap();
        assert!(read(&mut conn).unwrap().equipped.values().any(|v| *v == id));
        assert!(equip(&mut conn, 999).is_err());
    }
    #[test]
    fn time_unsolved_and_unfinished_attempts_cannot_earn_any_progress() {
        let mut conn = fixture();
        conn.execute_batch("INSERT INTO attempts(problem_id,started_at,abandoned_at,duration_seconds,outcome) VALUES('two-sum','2026-10-01','2026-10-01',740221,'Solved');
        INSERT INTO attempts(problem_id,started_at,completed_at,duration_seconds,outcome) VALUES('two-sum','2026-10-02','2026-10-02',740221,'Struggled');
        INSERT INTO attempts(problem_id,started_at,completed_at,duration_seconds,outcome,is_review) VALUES('two-sum','2026-10-03','2026-10-03',740221,'Needed hint',1);
        INSERT INTO attempts(problem_id,started_at,completed_at,duration_seconds,outcome) VALUES('two-sum','2026-10-04','2026-10-04',740221,'Couldn''t solve');
        INSERT INTO attempts(problem_id,started_at,duration_seconds,outcome) VALUES('two-sum','2026-10-05',740221,'Solved');").unwrap();
        let a = read(&mut conn).unwrap();
        assert_eq!(a.xp, 0);
        assert_eq!(a.crystals, 0);
        assert_eq!(a.solved_problems, 0);
        assert_eq!(a.shelves, 0);
        assert_eq!(a.items.len(), 4);
        // Editing a previously processed reflection cannot manufacture rewards.
        conn.execute(
            "UPDATE attempts SET outcome='Solved' WHERE completed_at IS NOT NULL",
            [],
        )
        .unwrap();
        assert_eq!(read(&mut conn).unwrap().xp, 0);
    }
    #[test]
    fn only_first_solves_and_daily_successful_reviews_earn_rewards() {
        let mut conn = fixture();
        conn.execute_batch("INSERT INTO attempts(problem_id,started_at,completed_at,duration_seconds,outcome,is_review) VALUES
        ('two-sum','2026-10-01','2026-10-01T12:00:00Z',NULL,'Easy',1),
        ('two-sum','2026-10-01','2026-10-01T13:00:00Z',740221,'Solved',1),
        ('two-sum','2026-10-02','2026-10-02T12:00:00Z',0,'Solved',1),
        ('two-sum','2026-10-02','2026-10-02T13:00:00Z',740221,'Easy',1),
        ('two-sum','2026-10-03','2026-10-03T12:00:00Z',740221,'Solved',0);").unwrap();
        let a = read(&mut conn).unwrap();
        assert_eq!(a.xp, 30);
        assert_eq!(a.crystals, 2);
        assert_eq!(a.solved_problems, 1);
        assert_eq!(read(&mut conn).unwrap().xp, 30);
        // Different textual dates can still be the same UTC review day.
        conn.execute_batch(
            "INSERT INTO attempts(problem_id,started_at,completed_at,outcome,is_review) VALUES
        ('two-sum','2026-10-04','2026-10-04T23:30:00-02:00','Solved',1),
        ('two-sum','2026-10-05','2026-10-05T02:00:00Z','Solved',1);",
        )
        .unwrap();
        let b = read(&mut conn).unwrap();
        assert_eq!(b.xp, 40);
        assert_eq!(b.crystals, 3);
    }
    #[test]
    fn diamond_requires_the_solve_milestone_even_with_multi_day_durations() {
        let mut conn = fixture();
        conn.execute("INSERT INTO attempts(problem_id,started_at,completed_at,duration_seconds,outcome)
            SELECT id,'2026-10-01','2026-10-01T12:00:00Z',740221,'Solved' FROM problems ORDER BY order_index,id LIMIT 54",[]).unwrap();
        let a = read(&mut conn).unwrap();
        assert_eq!(a.lifetime_xp, 1080);
        assert!(a.items.iter().all(|i| i.material != "diamond"));
        assert_eq!(a.next_reward.material, "diamond");
        assert_eq!(a.next_reward.xp_required, 20);
        conn.execute("INSERT INTO attempts(problem_id,started_at,completed_at,duration_seconds,outcome)
            SELECT id,'2026-10-02','2026-10-02T12:00:00Z',0,'Solved' FROM problems ORDER BY order_index,id LIMIT 1 OFFSET 54",[]).unwrap();
        let b = read(&mut conn).unwrap();
        assert_eq!(b.lifetime_xp, 1100);
        assert_eq!(
            b.items.iter().filter(|i| i.material == "diamond").count(),
            1
        );
        assert_eq!(b.crystals, 55);
    }
    #[test]
    fn active_or_failed_attempts_do_not_block_a_later_real_solve() {
        let mut conn = fixture();
        conn.execute_batch("INSERT INTO attempts(problem_id,started_at,completed_at,outcome) VALUES('two-sum','2026-10-01','2026-10-01','Struggled');
            INSERT INTO attempts(problem_id,started_at) VALUES('two-sum','2026-10-02');").unwrap();
        assert_eq!(read(&mut conn).unwrap().xp, 0);
        conn.execute("UPDATE attempts SET completed_at='2026-10-02',outcome='Solved' WHERE completed_at IS NULL", []).unwrap();
        let a = read(&mut conn).unwrap();
        assert_eq!(a.xp, 20);
        assert_eq!(a.crystals, 1);
        assert_eq!(a.solved_problems, 1);
    }
    #[test]
    fn a_failed_migration_rolls_back_the_backup_and_ledger_together() {
        let mut conn = fixture();
        history(&conn);
        let original;
        {
            let tx = conn.transaction().unwrap();
            let mut p = new_progress(42, 7);
            p.version = 3;
            p.xp = 9999;
            original = serde_json::to_string(&p).unwrap();
            save(&tx, &p).unwrap();
            tx.execute("INSERT INTO study_credits SELECT id,2000 FROM attempts", [])
                .unwrap();
            tx.commit().unwrap();
        }
        conn.execute_batch("CREATE TRIGGER fail_study_save BEFORE UPDATE ON study_state BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert!(read(&mut conn).is_err());
        let current: String = conn
            .query_row("SELECT payload FROM study_state", [], |r| r.get(0))
            .unwrap();
        assert_eq!(original, current);
        let backups: i64 = conn
            .query_row("SELECT COUNT(*) FROM study_reward_backups", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(backups, 0);
        let xp: i64 = conn
            .query_row("SELECT SUM(xp) FROM study_credits", [], |r| r.get(0))
            .unwrap();
        assert_eq!(xp, 10000);
    }
}
