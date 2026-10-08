//! Isolated native regression harness: no journal DB, LeetCode login or models.
//! Start Vite, then cargo run --example browser_surface_probe.
#[path = "../src/browser_surface.rs"]
mod browser_surface;
#[path = "../src/error.rs"]
mod error;
use tauri::Manager;

#[tauri::command]
fn probe_report(message: String) {
    println!("SURFACE PROBE: {message}");
}

#[tauri::command]
async fn probe_configure(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
    fullscreen: bool,
    zoom: f64,
) -> Result<f64, String> {
    println!("SURFACE PROBE: configure {width}x{height} fullscreen={fullscreen} zoom={zoom}");
    let window = app.get_window("main").unwrap();
    #[cfg(target_os = "macos")]
    app.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    let expected_width = if fullscreen {
        let monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("Missing monitor")?;
        monitor.size().width as f64 / monitor.scale_factor() / zoom
    } else {
        width / zoom
    };
    window
        .set_fullscreen(fullscreen)
        .map_err(|e| e.to_string())?;
    if !fullscreen {
        window
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
    }
    app.get_webview("main")
        .unwrap()
        .set_zoom(zoom)
        .map_err(|e| e.to_string())?;
    if fullscreen {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        println!(
            "SURFACE PROBE: native window fullscreen={:?}, size={:?}",
            window.is_fullscreen(),
            window.inner_size()
        );
        if !window.is_fullscreen().map_err(|e| e.to_string())? {
            return Err("macOS did not enter fullscreen; run the isolated preview in the foreground and verify using its green window button".into());
        }
    }
    Ok(expected_width)
}

#[tauri::command]
fn probe_quit(app: tauri::AppHandle, success: bool) {
    app.exit(if success { 0 } else { 1 });
}

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "com.leetjournal.surface-probe".into();
    let window = &mut context.config_mut().app.windows[0];
    window.title = "Browser Surface Test (isolated)".into();
    window.url = if std::env::var_os("LEETJOURNAL_SURFACE_INSPECT").is_some() {
        tauri::WebviewUrl::External(
            "http://localhost:1420/tests/browser-surface-preview.html?inspect"
                .parse()
                .unwrap(),
        )
    } else {
        tauri::WebviewUrl::App("tests/browser-surface-preview.html".into())
    };
    window.min_width = Some(600.0);
    window.min_height = Some(400.0);
    // The harness must finish even if macOS moves its window to another Space.
    // This is test-only; production retains normal background power saving.
    window.background_throttling = Some(tauri::utils::config::BackgroundThrottlingPolicy::Disabled);
    tauri::Builder::default()
        .setup(|app| {
            app.get_window("main").unwrap().set_focus()?;
            if std::env::var_os("LEETJOURNAL_SURFACE_INSPECT").is_none() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(45));
                    eprintln!("SURFACE PROBE: FAILED (watchdog timeout)");
                    handle.exit(1);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            browser_surface::sync_browser_surface,
            browser_surface::dispose_browser_surface,
            probe_report,
            probe_configure,
            probe_quit,
        ])
        .run(context)
        .expect("native surface harness");
}
