use crate::error::{AppError, AppResult};
use tauri::{AppHandle, Manager, State};

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
