//! Tauri core initialization library.
//!
//! Wires together the command endpoints, plugins, system tray, window close
//! listeners, and low-level hook threads.

pub mod commands;
pub mod engine;
pub mod storage;
pub mod tray;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

/// Entry-point bootstrapped by main.rs.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::start_recording,
            commands::stop_recording,
            commands::start_macro_playback,
            commands::stop_macro_playback,
            commands::listen_for_hotkey,
            commands::cancel_listen_for_hotkey,
            commands::unregister_global_hotkeys,
            commands::reregister_global_hotkeys,
            commands::save_macro_profile,
            commands::save_macro_profile_to_path,
            commands::load_macro_profile,
            commands::load_macro_profile_from_path,
            commands::update_hook_hotkeys,
            commands::save_loadout,
            commands::list_loadouts,
            commands::load_loadout,
            commands::delete_loadout,
            commands::import_loadout,
            commands::export_loadout,
            commands::list_themes,
            commands::save_custom_theme,
            commands::delete_theme,
            commands::get_theme_settings,
            commands::save_theme_settings,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Intercept close button and hide window to system tray instead
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            // Initialize global recorder mutex
            commands::init_recorder();

            // Initialize global shortcuts plugin
            if let Err(e) = engine::shortcut::init_global_shortcuts(app) {
                eprintln!("failed to initialize global shortcuts: {}", e);
            }

            // Register default hotkeys (F9=Record, F10=Start) immediately
            // These will be overridden when the profile loads from disk.
            if let Err(e) = engine::shortcut::register_hotkeys(app.handle(), "F9", "F10") {
                eprintln!("failed to register default hotkeys: {}", e);
            }

            // Create tray icon
            if let Err(e) = tray::create_tray(app) {
                eprintln!("failed to create system tray: {}", e);
            }

            // Check if launched via autostart argument to hide main window initially
            let is_autostart = std::env::args().any(|arg| arg == "--autostart");
            if is_autostart {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Load settings to synchronize global hook state on boot
            if let Ok(settings) = commands::get_theme_settings(app.app_handle().clone()) {
                engine::hook::set_record_drag_motion(settings.record_drag_motion);
            } else {
                engine::hook::set_record_drag_motion(true);
            }

            // Setup crossbeam-channel for hook events
            let (tx, rx) = crossbeam_channel::unbounded();
            
            // Start hook thread
            if let Err(e) = engine::hook::start_hooks(tx) {
                eprintln!("failed to start system input hooks: {}", e);
            }

            // Start background consumer thread to process inputs
            commands::start_consumer(rx, app.app_handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
