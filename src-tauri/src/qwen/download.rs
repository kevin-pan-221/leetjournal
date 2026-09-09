use super::{
    is_default_model, model_catalog, AppError, AppResult, Duration, QwenRuntime, LM_STUDIO_BASE_URL,
};
use tauri::State;

#[derive(serde::Deserialize, serde::Serialize)]
pub struct DownloadStatus {
    status: String,
    job_id: Option<String>,
    total_size_bytes: Option<u64>,
    downloaded_bytes: Option<u64>,
}

impl DownloadStatus {
    fn ready() -> Self {
        Self {
            status: "already_downloaded".into(),
            job_id: None,
            total_size_bytes: None,
            downloaded_bytes: None,
        }
    }

    fn active(&self) -> bool {
        matches!(self.status.as_str(), "downloading" | "paused")
    }
}

async fn status(client: &reqwest::Client, job: &str) -> AppResult<DownloadStatus> {
    let mut url = reqwest::Url::parse(&format!(
        "{LM_STUDIO_BASE_URL}/api/v1/models/download/status/"
    ))
    .unwrap();
    url.path_segments_mut().unwrap().push(job);
    client
        .get(url)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| AppError::Message("Can't check download progress. Try again.".into()))?
        .error_for_status()
        .map_err(|e| AppError::Message(format!("Download status unavailable: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Message(format!("Invalid download status: {e}")))
}

#[tauri::command]
pub async fn default_model_download_status(
    runtime: State<'_, QwenRuntime>,
) -> AppResult<Option<DownloadStatus>> {
    let job = runtime.download_job.lock().await.clone();
    match job {
        Some(job) => Ok(Some(status(&runtime.client, &job).await?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn download_default_model(runtime: State<'_, QwenRuntime>) -> AppResult<DownloadStatus> {
    // Serialize starts so double clicks or remounts cannot create duplicate jobs.
    let mut job = runtime.download_job.lock().await;
    let catalog = model_catalog(&runtime.client).await?;
    if catalog.models.iter().any(is_default_model) {
        *job = None;
        return Ok(DownloadStatus::ready());
    }
    if let Some(existing) = job.as_ref() {
        let current = status(&runtime.client, existing).await?;
        if current.active() {
            return Ok(current);
        }
    }
    // LM Studio resolves its catalog entry to a suitable downloadable variant.
    // Downloading does not load the model into inference memory.
    let result: DownloadStatus = runtime
        .client
        .post(format!("{LM_STUDIO_BASE_URL}/api/v1/models/download"))
        .timeout(Duration::from_secs(30))
        .json(&serde_json::json!({ "model": "qwen/qwen3.5-4b" }))
        .send()
        .await
        .map_err(|_| {
            AppError::Message(
                "Couldn't start the download. Check LM Studio setup and try again.".into(),
            )
        })?
        .error_for_status()
        .map_err(|e| AppError::Message(format!("Download unavailable: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Message(format!("Invalid download response: {e}")))?;
    if result.active() && result.job_id.is_none() {
        return Err(AppError::Message("LM Studio did not return download progress information. Check LM Studio before retrying.".into()));
    }
    *job = result.job_id.clone();
    Ok(result)
}
