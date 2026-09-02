mod commands;
mod db;
mod error;
mod models;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{AppHandle, Manager, Wry};

pub struct FocusShortcut {
    pub item: tauri::menu::MenuItem<Wry>,
    pub enabled: Arc<AtomicBool>,
}

#[cfg(target_os = "macos")]
fn install_focus_escape_monitor(app: AppHandle<Wry>, enabled: Arc<AtomicBool>) {
    use block2::RcBlock;
    use objc2_app_kit::{NSEvent, NSEventMask};
    use std::{ptr, ptr::NonNull};
    use tauri::Emitter;

    // WKWebView can consume Escape before AppKit resolves a menu accelerator.
    // A local monitor observes only this process and keeps the shortcut reliable
    // without polling or registering a system-wide global shortcut.
    let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        let event_ref = unsafe { event.as_ref() };
        if enabled.load(Ordering::Relaxed) && event_ref.keyCode() == 53 {
            let _ = app.emit("focus-escape", ());
            ptr::null_mut()
        } else {
            event.as_ptr()
        }
    });

    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &handler)
    };
    // The monitor is intentionally process-lifetime state. AppKit owns the
    // handler, and there is no shorter lifecycle than the application itself.
    std::mem::forget(monitor);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .menu(|app| {
            let menu = tauri::menu::Menu::default(app)?;
            let leave_focus = tauri::menu::MenuItem::with_id(
                app,
                "leave-focus-session",
                "Leave Focus Session",
                false,
                Some("Escape"),
            )?;
            let session_menu =
                tauri::menu::Submenu::with_items(app, "Session", true, &[&leave_focus])?;
            // macOS keeps Help as the trailing system menu. Insert our app menu
            // before Window and Help instead of appending after Help, which the
            // native menu bar may ignore.
            menu.insert(&session_menu, 4)?;
            let enabled = Arc::new(AtomicBool::new(false));
            app.manage(FocusShortcut {
                item: leave_focus,
                enabled: enabled.clone(),
            });
            #[cfg(target_os = "macos")]
            install_focus_escape_monitor(app.clone(), enabled);
            Ok(menu)
        })
        .setup(|app| {
            let db = db::initialize(app.handle())?;
            app.manage(db);
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "leave-focus-session" {
                use tauri::Emitter;
                let _ = app.emit("focus-escape", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_attempt,
            commands::toggle_pause,
            commands::pause_attempt,
            commands::save_attempt_notes,
            commands::abandon_attempt,
            commands::finish_attempt,
            commands::get_journal,
            commands::get_review_queue,
            commands::get_dashboard,
            commands::get_garden_state,
            commands::get_settings,
            commands::save_settings,
            commands::get_focus_context,
            commands::set_today_plan_item,
            commands::get_problem_library,
            commands::create_problem_book,
            commands::get_book_problems,
            commands::ask_qwen,
            commands::get_leetcode_editor_code,
            commands::set_focus_shortcut_enabled,
            commands::set_leetcode_webview_bounds
        ])
        .run(tauri::generate_context!())
        .expect("error while running LeetJournal");
}
