//! Visual overlay manager.
//!
//! Spawns semi-transparent click-through overlay windows on all connected monitors
//! during Recording mode. Utilizes Tauri's WebviewWindow and Win32 extended styles.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Shows a transparent borderless click-through overlay window on every detected monitor.
/// Re-uses existing windows if they were hidden from a previous recording session.
///
/// # Thread Safety
/// Must be called from the Tauri main thread.
pub fn show_overlays(app_handle: &AppHandle) {
    let monitors = app_handle.available_monitors().unwrap_or_default();

    for (index, monitor) in monitors.iter().enumerate() {
        let pos = monitor.position();
        let size = monitor.size();
        let scale = monitor.scale_factor();

        let label = format!("overlay-{}", index);

        // If the overlay window already exists (hidden from a previous session), re-show it
        if let Some(window) = app_handle.get_webview_window(&label) {
            let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
            let _ = window.set_size(tauri::PhysicalSize::new(size.width, size.height));
            let _ = window.show();
            let _ = window.set_always_on_top(true);
            let _ = window.set_ignore_cursor_events(true);
            continue;
        }

        // Initialize window builder referencing the dedicated overlay.html page
        let url = WebviewUrl::App(format!("overlay.html?id={}", index).into());
        let builder = WebviewWindowBuilder::new(app_handle, &label, url)
            .title("Recording Overlay")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .resizable(false)
            .focused(false)
            .visible(false) // Start hidden to prevent white flash
            .shadow(false)  // Disable the OS window drop shadow border
            .position(pos.x as f64 / scale, pos.y as f64 / scale)
            .inner_size(size.width as f64 / scale, size.height as f64 / scale)
            .on_page_load(|window, payload| {
                if payload.event() == tauri::webview::PageLoadEvent::Finished {
                    let _ = window.show();
                    let _ = window.set_always_on_top(true);
                }
            });

        if let Ok(window) = builder.build() {
            let _ = window.set_ignore_cursor_events(true);
        }
    }
}

/// Hides all active overlay windows (without destroying them so they can be re-shown).
///
/// # Thread Safety
/// Must be called from the Tauri main thread.
pub fn hide_overlays(app_handle: &AppHandle) {
    // Probe and hide up to 16 monitor overlays
    for index in 0..16 {
        let label = format!("overlay-{}", index);
        if let Some(window) = app_handle.get_webview_window(&label) {
            let _ = window.hide();
        }
    }
}
