use crate::error::{AppError, AppResult};
#[cfg(target_os = "macos")]
pub mod notifications;
use serde::{Deserialize, Serialize};
use std::{
    future::Future,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use tauri::{AppHandle, Manager, State, Webview};
use tokio::{
    process::Command,
    sync::{Mutex, Notify},
};

fn message(text: impl Into<String>) -> AppError {
    AppError::Message(text.into())
}

fn trusted(webview: &Webview) -> AppResult<()> {
    if webview.label() != "main" {
        return Err(message("Spotify is only available in the main app."));
    }
    if !cfg!(target_os = "macos") {
        return Err(message("Local Spotify controls currently require macOS."));
    }
    Ok(())
}

// One lock serializes commands, permission requests and disabling the feature.
// No credentials, OAuth server or network client are needed.
#[derive(Default)]
pub struct SpotifyRuntime {
    state: Mutex<Option<bool>>,
    controls: AtomicUsize,
    interrupt_read: Notify,
}

struct ControlPriority<'a>(&'a SpotifyRuntime);
impl Drop for ControlPriority<'_> {
    fn drop(&mut self) {
        self.0.controls.fetch_sub(1, Ordering::SeqCst);
    }
}

impl SpotifyRuntime {
    fn prioritize_control(&self) -> ControlPriority<'_> {
        self.controls.fetch_add(1, Ordering::SeqCst);
        self.interrupt_read.notify_waiters();
        ControlPriority(self)
    }

    // Only reads can be interrupted. Never cancel/retry a transport command:
    // Spotify may already have acted on it (especially next/previous).
    async fn read_when_idle<F>(&self, read: F) -> AppResult<Option<Playback>>
    where
        F: Future<Output = AppResult<Option<Playback>>>,
    {
        let interrupt = self.interrupt_read.notified();
        tokio::pin!(interrupt);
        interrupt.as_mut().enable();
        if self.controls.load(Ordering::SeqCst) > 0 {
            return Ok(None);
        }
        tokio::select! {
            biased;
            _ = interrupt => Ok(None),
            result = read => result,
        }
    }
}

#[derive(Serialize)]
pub struct ConnectionStatus {
    enabled: bool,
    supported: bool,
}

#[derive(Serialize, Deserialize)]
pub struct Track {
    name: String,
    artist: String,
    duration_ms: u32,
    artwork_url: String,
    url: String,
}

#[derive(Serialize, Deserialize)]
pub struct Playback {
    running: bool,
    is_playing: bool,
    progress_ms: u32,
    volume_percent: u8,
    item: Option<Track>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ScriptReply {
    Failure { error: String },
    Playback(Playback),
    Accepted(()),
}

fn decode_reply(bytes: &[u8]) -> AppResult<Option<Playback>> {
    match serde_json::from_slice::<ScriptReply>(bytes)
        .map_err(|_| message("Could not read Spotify playback. Try again."))?
    {
        ScriptReply::Playback(playback) => Ok(Some(playback)),
        ScriptReply::Accepted(()) => Ok(None),
        ScriptReply::Failure { error } => Err(message(match error.as_str() {
            "permission" => "Allow LeetJournal to control Spotify in System Settings → Privacy & Security → Automation, then retry.",
            "missing" => "Install the Spotify desktop app, then try again.",
            "closed" => "Spotify is closed. Open Spotify to use playback controls.",
            _ => "Spotify could not complete that action. Open Spotify and try again.",
        })),
    }
}

async fn run_script(operation: &str, value: Option<u32>) -> AppResult<Option<Playback>> {
    let mut command = Command::new("/usr/bin/osascript");
    command.args([
        "-l",
        "JavaScript",
        "-e",
        include_str!("player.js"),
        operation,
    ]);
    if let Some(value) = value {
        command.arg(value.to_string());
    }
    // Dropping a timed-out command kills the child; hung automation cannot
    // accumulate processes or block the UI thread. Permission prompts get longer.
    command.kill_on_drop(true);
    let timeout = if operation == "enable" { 60 } else { 8 };
    let output = tokio::time::timeout(Duration::from_secs(timeout), command.output())
        .await
        .map_err(|_| {
            message("Spotify did not respond. Check any macOS permission prompt and retry.")
        })?
        .map_err(|_| message("Could not start macOS Spotify controls."))?;
    if !output.status.success() {
        return Err(message(
            "macOS could not contact Spotify. Check Automation permissions and retry.",
        ));
    }
    decode_reply(&output.stdout)
}

fn read_enabled(path: &Path) -> AppResult<bool> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(Into::into),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(message(format!(
            "Could not read Spotify preference: {error}"
        ))),
    }
}

fn preference_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("spotify-local.json"))
        .map_err(|_| message("Could not locate Spotify preference."))
}

fn enabled(app: &AppHandle, state: &mut Option<bool>) -> AppResult<bool> {
    if let Some(value) = state {
        return Ok(*value);
    }
    let value = read_enabled(&preference_path(app)?)?;
    *state = Some(value);
    Ok(value)
}

fn save_enabled(app: &AppHandle, state: &mut Option<bool>, value: bool) -> AppResult<()> {
    let path = preference_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| message("Invalid Spotify preference path."))?;
    std::fs::create_dir_all(parent).map_err(|_| message("Could not save Spotify preference."))?;
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, if value { "true" } else { "false" })
        .and_then(|()| std::fs::rename(&temporary, &path))
        .map_err(|_| message("Could not save Spotify preference."))?;
    *state = Some(value);
    Ok(())
}

#[tauri::command]
pub async fn spotify_status(
    webview: Webview,
    app: AppHandle,
    runtime: State<'_, SpotifyRuntime>,
) -> AppResult<ConnectionStatus> {
    if webview.label() != "main" {
        return Err(message("Spotify is only available in the main app."));
    }
    let mut state = runtime.state.lock().await;
    Ok(ConnectionStatus {
        enabled: enabled(&app, &mut state)?,
        supported: cfg!(target_os = "macos"),
    })
}

#[tauri::command]
pub async fn spotify_connect(
    webview: Webview,
    app: AppHandle,
    runtime: State<'_, SpotifyRuntime>,
) -> AppResult<ConnectionStatus> {
    trusted(&webview)?;
    let mut state = runtime.state.lock().await;
    run_script("enable", None).await?;
    save_enabled(&app, &mut state, true)?;
    Ok(ConnectionStatus {
        enabled: true,
        supported: true,
    })
}

#[tauri::command]
pub async fn spotify_disconnect(
    webview: Webview,
    app: AppHandle,
    runtime: State<'_, SpotifyRuntime>,
) -> AppResult<()> {
    trusted(&webview)?;
    let _priority = runtime.prioritize_control();
    let mut state = runtime.state.lock().await;
    save_enabled(&app, &mut state, false)
}

#[tauri::command]
pub async fn spotify_playback(
    webview: Webview,
    app: AppHandle,
    runtime: State<'_, SpotifyRuntime>,
) -> AppResult<Option<Playback>> {
    trusted(&webview)?;
    let mut state = runtime.state.lock().await;
    if !enabled(&app, &mut state)? {
        return Err(message("Enable Spotify in Settings first."));
    }
    runtime.read_when_idle(run_script("playback", None)).await
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PlayerAction {
    Play,
    Pause,
    Next,
    Previous,
    Open,
    Seek { position: u32 },
    Volume { percent: u8 },
}

fn action_args(action: PlayerAction) -> AppResult<(&'static str, Option<u32>)> {
    Ok(match action {
        PlayerAction::Play => ("play", None),
        PlayerAction::Pause => ("pause", None),
        PlayerAction::Next => ("next", None),
        PlayerAction::Previous => ("previous", None),
        PlayerAction::Open => ("open", None),
        PlayerAction::Seek { position } => ("seek", Some(position)),
        PlayerAction::Volume { percent } if percent <= 100 => ("volume", Some(percent.into())),
        _ => return Err(message("Invalid Spotify playback action.")),
    })
}

#[tauri::command]
pub async fn spotify_control(
    webview: Webview,
    app: AppHandle,
    action: PlayerAction,
    runtime: State<'_, SpotifyRuntime>,
) -> AppResult<()> {
    trusted(&webview)?;
    let (operation, value) = action_args(action)?;
    let _priority = runtime.prioritize_control();
    let mut state = runtime.state.lock().await;
    if !enabled(&app, &mut state)? {
        return Err(message("Enable Spotify in Settings first."));
    }
    run_script(operation, value).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn controls_interrupt_reads_without_leaving_a_stale_interrupt() {
        let runtime = SpotifyRuntime::default();
        let read = runtime.read_when_idle(std::future::pending());
        tokio::pin!(read);
        // Poll the read so it registers for interruption, then queue a command.
        assert!(tokio::time::timeout(Duration::from_millis(5), &mut read)
            .await
            .is_err());
        let priority = runtime.prioritize_control();
        assert!(tokio::time::timeout(Duration::from_millis(100), &mut read)
            .await
            .unwrap()
            .unwrap()
            .is_none());
        assert!(runtime
            .read_when_idle(async { panic!("read must not start while controls wait") })
            .await
            .unwrap()
            .is_none());
        drop(priority);
        let ran = std::cell::Cell::new(false);
        runtime
            .read_when_idle(async {
                ran.set(true);
                Ok(None)
            })
            .await
            .unwrap();
        assert!(
            ran.get(),
            "the first post-command refresh must not be skipped"
        );
        assert_eq!(runtime.controls.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn controls_are_typed_and_bounded() {
        assert!(action_args(PlayerAction::Volume { percent: 101 }).is_err());
        assert_eq!(
            action_args(PlayerAction::Seek { position: 1000 }).unwrap(),
            ("seek", Some(1000))
        );
        assert!(
            serde_json::from_str::<PlayerAction>(r#"{"type":"transfer","device":"anything"}"#)
                .is_err()
        );
        assert!(serde_json::from_str::<PlayerAction>(r#"{"type":"seek","position":-1}"#).is_err());
    }
    #[test]
    fn closed_spotify_is_not_an_error_and_permission_errors_are_actionable() {
        let reply = decode_reply(br#"{"running":false,"is_playing":false,"progress_ms":0,"volume_percent":0,"item":null}"#).unwrap();
        assert!(!reply.unwrap().running);
        assert!(decode_reply(b"null").unwrap().is_none());
        assert!(decode_reply(br#"{"error":"permission"}"#)
            .err()
            .unwrap()
            .to_string()
            .contains("Automation"));
        assert!(decode_reply(b"bad data").is_err());
    }
}
