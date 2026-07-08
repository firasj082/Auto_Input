//! System tray menu configuration.
//!
//! Handles creating the system tray, registering double-click restoration,
//! and building context menus (e.g. "Show App", "Quit").

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{App, Manager};

/// Creates and configures the system tray for the application.
///
/// # Errors
/// Returns a Tauri Error if menu creation or tray initialization fails.
pub fn create_tray(app: &App) -> Result<(), tauri::Error> {
    let handle = app.app_handle();

    // Create system tray menu items
    let show_item = MenuItem::with_id(handle, "show", "Show App", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(handle, "quit", "Quit", true, None::<&str>)?;
    
    let menu = Menu::with_items(handle, &[&show_item, &quit_item])?;

    let builder = TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app_handle, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app_handle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                let app_handle = tray.app_handle();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });

    // Check if default window icon is available, clone if so
    let builder = if let Some(icon) = app.default_window_icon() {
        builder.icon(icon.clone())
    } else {
        builder
    };

    builder.build(app)?;
    Ok(())
}
