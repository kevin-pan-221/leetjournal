mod browser_surface;
mod commands;
mod db;
mod error;
mod garden;
mod models;
mod offline;
mod offline_batch;
mod offline_images;
pub use offline_batch::prepare_existing_book;
mod qwen;
mod spotify;
mod study;
mod workspace;

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
    let quitting = AtomicBool::new(false);
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
            app.manage(offline_batch::OfflineBatch::default());
            app.manage(qwen::QwenRuntime::default());
            app.manage(spotify::SpotifyRuntime::default());
            #[cfg(target_os = "macos")]
            spotify::notifications::install(app.handle().clone());
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "leave-focus-session" {
                use tauri::Emitter;
                let _ = app.emit("focus-escape", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            offline::get_offline_problem,
            offline::list_offline_problems,
            offline::download_offline_problem,
            offline::save_offline_draft,
            offline::record_offline_submission,
            offline::list_offline_submissions,
            offline::list_offline_accepted,
            offline_batch::save_offline_book,
            offline_batch::pause_offline_book,
            offline_batch::offline_book_status,
            study::get_study,
            study::enchant_study_item,
            study::equip_study_item,
            spotify::spotify_status,
            spotify::spotify_connect,
            spotify::spotify_disconnect,
            spotify::spotify_playback,
            spotify::spotify_control,
            commands::start_attempt,
            commands::toggle_pause,
            commands::pause_attempt,
            commands::save_attempt_notes,
            commands::abandon_attempt,
            commands::finish_attempt,
            commands::get_journal,
            commands::update_journal_entry,
            commands::get_dashboard,
            commands::get_garden_state,
            commands::get_settings,
            commands::save_settings,
            commands::get_focus_context,
            commands::set_today_plan_item,
            commands::get_problem_library,
            commands::create_problem_book,
            commands::update_problem_book,
            commands::import_book_problems,
            commands::remove_book_problem,
            commands::delete_problem_book,
            commands::get_book_problems,
            commands::get_problem_books,
            qwen::ask_qwen,
            qwen::list_local_models,
            qwen::download::download_default_model,
            qwen::download::default_model_download_status,
            qwen::stop_qwen,
            qwen::unload_qwen,
            workspace::get_leetcode_editor_code,
            workspace::leetcode_reachable,
            workspace::set_focus_shortcut_enabled,
            browser_surface::sync_browser_surface,
            browser_surface::dispose_browser_surface
        ])
        .build(tauri::generate_context!())
        .expect("error while building LeetJournal")
        .run(move |app, event| {
            if let tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                api.prevent_exit();
                if quitting.swap(true, Ordering::Relaxed) {
                    return;
                }
                let runtime = app.state::<qwen::QwenRuntime>().inner().clone();
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = qwen::release_runtime(&runtime).await {
                        eprintln!("Qwen release on quit failed: {error}");
                    }
                    app.exit(0);
                });
            }
        });
}
