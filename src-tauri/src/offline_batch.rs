//! One paced, cancellable download queue shared by the desktop and preparation tool.
use crate::{
    db::Db,
    error::{AppError, AppResult},
    offline,
};
use serde::Serialize;
use std::{
    future::Future,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};

const EVENT: &str = "offline-book-progress";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Issue {
    problem_id: String,
    title: String,
    message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Progress {
    pub book_id: String,
    pub book_title: String,
    pub status: &'static str,
    pub total: usize,
    pub saved_ids: Vec<String>,
    pub current: Option<String>,
    pub issues: Vec<Issue>,
    pub message: Option<String>,
    pub revision: u64,
}

#[derive(Default)]
pub(crate) struct OfflineBatch {
    progress: Mutex<Option<Progress>>,
    cancel: AtomicBool,
}

struct Item {
    id: String,
    title: String,
}

fn plan(db: &Db, book_id: &str) -> AppResult<(Progress, Vec<Item>)> {
    let conn = db.0.lock().unwrap();
    let book_title = conn.query_row(
        "SELECT title FROM problem_books WHERE id=?1",
        [book_id],
        |r| r.get(0),
    )?;
    let mut stmt = conn.prepare("SELECT p.id,p.title,o.problem_id IS NOT NULL FROM problem_book_items b JOIN problems p ON p.id=b.problem_id LEFT JOIN offline_problems o ON o.problem_id=p.id WHERE b.book_id=?1 ORDER BY b.order_index,p.id")?;
    let rows = stmt
        .query_map([book_id], |r| {
            Ok((
                Item {
                    id: r.get(0)?,
                    title: r.get(1)?,
                },
                r.get::<_, bool>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut progress = Progress {
        book_id: book_id.into(),
        book_title,
        status: "running",
        total: rows.len(),
        saved_ids: vec![],
        current: None,
        issues: vec![],
        message: None,
        revision: 0,
    };
    let mut pending = vec![];
    for (item, saved) in rows {
        if saved {
            progress.saved_ids.push(item.id);
        } else {
            pending.push(item);
        }
    }
    Ok((progress, pending))
}

// Fetch is injectable so cancellation, rate-limit handling and resume behavior
// are tested without making network requests or changing a user's database.
async fn run_queue<F, Fut>(
    mut progress: Progress,
    pending: Vec<Item>,
    cancel: &AtomicBool,
    mut publish: impl FnMut(&Progress),
    mut fetch: F,
    pace: Duration,
) -> Progress
where
    F: FnMut(String) -> Fut,
    Fut: Future<Output = Result<(), offline::DownloadFailure>>,
{
    for item in pending {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        progress.current = Some(item.title.clone());
        publish(&progress);
        match fetch(item.id.clone()).await {
            Ok(()) => progress.saved_ids.push(item.id),
            Err(failure) => {
                let message = failure.error.to_string();
                progress.issues.push(Issue {
                    problem_id: item.id,
                    title: item.title,
                    message: message.clone(),
                });
                if !failure.unavailable {
                    progress.status = "paused";
                    progress.message = Some(message);
                    break;
                }
            }
        }
        progress.current = None;
        publish(&progress);
        // Stop promptly between requests. In-flight requests have bounded timeouts.
        let deadline = tokio::time::Instant::now() + pace;
        while tokio::time::Instant::now() < deadline && !cancel.load(Ordering::Relaxed) {
            tokio::time::sleep(Duration::from_millis(100).min(pace)).await;
        }
    }
    if cancel.load(Ordering::Relaxed) {
        progress.status = "paused";
        progress.message = Some("Download paused. Saved copies are ready to use.".into());
    } else if progress.status == "running" {
        progress.status = "completed";
    }
    progress.current = None;
    publish(&progress);
    progress
}

async fn prepare(
    db: &Db,
    progress: Progress,
    pending: Vec<Item>,
    cancel: &AtomicBool,
    publish: impl FnMut(&Progress),
) -> AppResult<Progress> {
    let client = offline::download_client()?;
    Ok(run_queue(
        progress,
        pending,
        cancel,
        publish,
        |id| {
            let client = &client;
            async move {
                // Another view may have saved this problem since the queue started.
                if offline::read(&db.0.lock().unwrap(), &id)?.is_some() {
                    return Ok(());
                }
                offline::download_to_db(&id, db, client).await.map(|_| ())
            }
        },
        Duration::from_secs(2),
    )
    .await)
}

impl OfflineBatch {
    fn publish(&self, app: &AppHandle, mut next: Progress) {
        let mut state = self.progress.lock().unwrap();
        next.revision = state.as_ref().map_or(1, |s| s.revision + 1);
        *state = Some(next.clone());
        let _ = app.emit(EVENT, next);
    }
}

#[tauri::command]
pub(crate) fn offline_book_status(batch: State<OfflineBatch>) -> Option<Progress> {
    batch.progress.lock().unwrap().clone()
}

#[tauri::command]
pub(crate) fn pause_offline_book(book_id: String, batch: State<OfflineBatch>) {
    let state = batch.progress.lock().unwrap();
    if state
        .as_ref()
        .is_some_and(|s| s.book_id == book_id && s.status == "running")
    {
        batch.cancel.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub(crate) fn save_offline_book(
    book_id: String,
    app: AppHandle,
    db: State<Db>,
    batch: State<OfflineBatch>,
) -> AppResult<Progress> {
    let mut state = batch.progress.lock().unwrap();
    if let Some(current) = state.as_ref().filter(|p| p.status == "running") {
        return if current.book_id == book_id {
            Ok(current.clone())
        } else {
            Err(AppError::Message(format!(
                "{} is being saved. Pause it before saving another book.",
                current.book_title
            )))
        };
    }
    let (mut progress, pending) = plan(&db, &book_id)?;
    progress.revision = state.as_ref().map_or(1, |s| s.revision + 1);
    batch.cancel.store(false, Ordering::Relaxed);
    *state = Some(progress.clone());
    let initial = progress.clone();
    drop(state);
    let _ = app.emit(EVENT, &initial);
    tauri::async_runtime::spawn(async move {
        let batch = app.state::<OfflineBatch>();
        let db = app.state::<Db>();
        if let Err(error) = prepare(&db, progress, pending, &batch.cancel, |p| {
            batch.publish(&app, p.clone())
        })
        .await
        {
            let mut failed = batch.progress.lock().unwrap().clone().unwrap();
            failed.status = "paused";
            failed.current = None;
            failed.message = Some(error.to_string());
            batch.publish(&app, failed);
        }
    });
    Ok(initial)
}

/// Explicit developer utility: opens an existing database and writes ONLY the
/// offline cache. It does not seed/reset data or create attempts/solve credit.
pub async fn prepare_existing_book(
    path: &std::path::Path,
    book_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let conn =
        rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    offline::initialize(&conn)?;
    let db = Db(Mutex::new(conn));
    let (progress, pending) = plan(&db, book_id)?;
    let result = prepare(&db, progress, pending, &AtomicBool::new(false), |p| {
        if p.current.is_none() {
            println!(
                "{}",
                serde_json::json!({
                    "bookId":p.book_id,"status":p.status,"total":p.total,
                    "saved":p.saved_ids.len(),"issues":p.issues,"message":p.message,
                })
            );
        }
    })
    .await?;
    if result.status != "completed" || !result.issues.is_empty() {
        return Err(
            "Some problems were not saved; inspect the progress report before resuming.".into(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Db {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE problems(id TEXT PRIMARY KEY,title TEXT); CREATE TABLE problem_books(id TEXT PRIMARY KEY,title TEXT); CREATE TABLE problem_book_items(book_id TEXT,problem_id TEXT,order_index INTEGER); INSERT INTO problems VALUES('a','A'),('b','B'),('c','C'); INSERT INTO problem_books VALUES('book','Book'); INSERT INTO problem_book_items VALUES('book','a',1),('book','b',2),('book','c',3);").unwrap();
        offline::initialize(&conn).unwrap();
        conn.execute(
            "INSERT INTO offline_problems VALUES('a','{}','my code','my tests','now')",
            [],
        )
        .unwrap();
        Db(Mutex::new(conn))
    }
    #[test]
    fn resume_plans_only_missing_problems_in_book_order() {
        let db = database();
        let (progress, pending) = plan(&db, "book").unwrap();
        assert_eq!(progress.total, 3);
        assert_eq!(progress.saved_ids, vec!["a"]);
        assert_eq!(
            pending.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
            vec!["b", "c"]
        );
        assert_eq!(
            offline::read(&db.0.lock().unwrap(), "a")
                .unwrap()
                .unwrap()
                .code,
            "my code"
        );
        assert!(plan(&db, "missing").is_err());
    }
    #[tokio::test]
    async fn stops_on_transport_or_rate_limit_but_skips_unavailable_statements() {
        for unavailable in [false, true] {
            let (progress, pending) = plan(&database(), "book").unwrap();
            let result = run_queue(
                progress,
                pending,
                &AtomicBool::new(false),
                |_| {},
                |id| async move {
                    if id == "b" {
                        Err(offline::DownloadFailure {
                            error: AppError::Message("blocked".into()),
                            unavailable,
                        })
                    } else {
                        Ok(())
                    }
                },
                Duration::ZERO,
            )
            .await;
            assert_eq!(
                result.status,
                if unavailable { "completed" } else { "paused" }
            );
            assert_eq!(result.saved_ids.len(), if unavailable { 2 } else { 1 });
            assert_eq!(result.issues.len(), 1);
            assert!(result.current.is_none());
        }
    }
    #[tokio::test]
    async fn cancellation_keeps_completed_downloads_and_stops_next_request() {
        let (progress, pending) = plan(&database(), "book").unwrap();
        let cancel = AtomicBool::new(false);
        let result = run_queue(
            progress,
            pending,
            &cancel,
            |_| {},
            |_| {
                cancel.store(true, Ordering::Relaxed);
                std::future::ready(Ok(()))
            },
            Duration::ZERO,
        )
        .await;
        assert_eq!(result.status, "paused");
        assert_eq!(result.saved_ids, vec!["a", "b"]);
    }
}
