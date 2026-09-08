use crate::error::{AppError, AppResult};
use futures_util::{
    future::{AbortHandle, Abortable},
    lock::Mutex as AsyncMutex,
    StreamExt,
};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{ipc::Channel, State};

mod stream;

const LM_STUDIO_BASE_URL: &str = "http://127.0.0.1:1234";
const IDLE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Default)]
pub struct QwenRuntime {
    loaded: Arc<AsyncMutex<Option<String>>>,
    control: Arc<Mutex<QwenControl>>,
    client: reqwest::Client,
}

#[derive(Default)]
struct QwenControl {
    abort: Option<AbortHandle>,
    releasing: usize,
    idle_abort: Option<AbortHandle>,
    generation: u64,
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
        control.generation = control.generation.wrapping_add(1);
        if let Some(idle) = control.idle_abort.take() {
            idle.abort();
        }
        control.abort = Some(abort);
        Ok((loaded, registration))
    }

    fn begin_release(&self) -> QwenRelease<'_> {
        let mut control = self.control.lock().unwrap();
        control.releasing += 1;
        control.generation = control.generation.wrapping_add(1);
        if let Some(idle) = control.idle_abort.take() {
            idle.abort();
        }
        if let Some(abort) = &control.abort {
            abort.abort();
        }
        QwenRelease(self)
    }

    fn schedule_idle_release(&self, delay: Duration) {
        let mut control = self.control.lock().unwrap();
        if control.releasing > 0 {
            return;
        }
        if let Some(idle) = control.idle_abort.take() {
            idle.abort();
        }
        let generation = control.generation;
        let (abort, registration) = AbortHandle::new_pair();
        control.idle_abort = Some(abort);
        let runtime = self.clone();
        tauri::async_runtime::spawn(async move {
            if Abortable::new(tokio::time::sleep(delay), registration)
                .await
                .is_err()
            {
                return;
            }
            // Check the generation and acquire the model lock atomically with
            // respect to starting a request. An old timer cannot evict a new one.
            let Some(mut loaded) = runtime.idle_model(generation) else {
                return;
            };
            if let Err(error) = release_instance(&runtime.client, &mut loaded).await {
                eprintln!("Qwen idle release failed: {error}");
            }
        });
    }

    fn idle_model(
        &self,
        generation: u64,
    ) -> Option<futures_util::lock::MutexGuard<'_, Option<String>>> {
        let mut control = self.control.lock().unwrap();
        if control.generation != generation || control.releasing > 0 {
            return None;
        }
        let loaded = self.loaded.try_lock()?;
        control.idle_abort = None;
        Some(loaded)
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

    #[test]
    fn stale_idle_timer_cannot_release_a_new_request() {
        let runtime = QwenRuntime::default();
        let old_generation = runtime.control.lock().unwrap().generation;
        let (loaded, _) = runtime.begin_request().unwrap();
        assert!(runtime.idle_model(old_generation).is_none());
        let current_generation = runtime.control.lock().unwrap().generation;
        assert!(runtime.idle_model(current_generation).is_none());
        drop(loaded);
        assert!(runtime.idle_model(old_generation).is_none());
        assert!(runtime.idle_model(current_generation).is_some());
    }

    #[test]
    fn follow_up_cancels_the_pending_idle_timer() {
        tauri::async_runtime::block_on(async {
            let runtime = QwenRuntime::default();
            runtime.schedule_idle_release(Duration::from_secs(60));
            let idle = runtime.control.lock().unwrap().idle_abort.clone().unwrap();
            let (_loaded, _) = runtime.begin_request().unwrap();
            assert!(idle.is_aborted());
            assert!(runtime.control.lock().unwrap().idle_abort.is_none());
        });
    }

    #[test]
    #[ignore = "requires local LM Studio; loads and unloads Qwen 4B"]
    fn live_model_is_released_by_idle_timer() {
        tauri::async_runtime::block_on(async {
            let runtime = QwenRuntime::default();
            {
                let (mut loaded, _) = runtime.begin_request().unwrap();
                qwen_instance(&runtime.client, &mut loaded).await.unwrap();
            }
            runtime.schedule_idle_release(IDLE_TIMEOUT);
            eprintln!("Qwen loaded; waiting for the production 60-second idle timeout.");
            tokio::time::sleep(IDLE_TIMEOUT + Duration::from_secs(2)).await;
            assert!(runtime.loaded.lock().await.is_none());
            let catalog = runtime
                .client
                .get(format!("{LM_STUDIO_BASE_URL}/api/v1/models"))
                .send()
                .await
                .unwrap()
                .json::<LmModelCatalog>()
                .await
                .unwrap();
            assert!(catalog
                .models
                .iter()
                .filter(|model| is_qwen_35_4b(model))
                .all(|model| model.loaded_instances.is_empty()));
        });
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
        .timeout(Duration::from_secs(5))
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
            .timeout(Duration::from_secs(120))
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
    let client = &runtime.client;
    let (mut loaded, registration) = runtime.begin_request()?;
    // Finish loading before release; cancelling the HTTP load can leave an
    // instance loading in LM Studio without returning its identifier to us.
    let result = match qwen_instance(client, &mut loaded).await {
        Ok(instance_id) => Abortable::new(
            stream_qwen(client, &instance_id, prompt, &on_token),
            registration,
        )
        .await
        .unwrap_or(Ok(())),
        Err(error) => Err(error),
    };
    runtime.control.lock().unwrap().abort = None;
    if loaded.is_some() {
        runtime.schedule_idle_release(IDLE_TIMEOUT);
    }
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
        .timeout(Duration::from_secs(120))
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
    let mut decoder = stream::QwenStream::default();
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
    release_runtime(&runtime).await
}

pub async fn release_runtime(runtime: &QwenRuntime) -> AppResult<()> {
    let _release = runtime.begin_release();
    let mut loaded = runtime.loaded.lock().await;
    release_instance(&runtime.client, &mut loaded).await
}

async fn release_instance(client: &reqwest::Client, loaded: &mut Option<String>) -> AppResult<()> {
    let Some(instance_id) = loaded.as_ref() else {
        return Ok(());
    };
    let response = client
        .post(format!("{LM_STUDIO_BASE_URL}/api/v1/models/unload"))
        .timeout(Duration::from_secs(15))
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
