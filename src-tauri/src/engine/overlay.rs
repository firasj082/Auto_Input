//! Visual overlay manager.
//!
//! Spawns semi-transparent click-through overlay windows on all connected monitors
//! during Recording mode. Utilizes Tauri's WebviewWindow and Win32 extended styles.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Spawns a transparent borderless click-through overlay window on every detected monitor.
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

        // Skip spawning if window already exists
        if app_handle.get_webview_window(&label).is_some() {
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
            .position(pos.x as f64 / scale, pos.y as f64 / scale)
            .inner_size(size.width as f64 / scale, size.height as f64 / scale);

        if let Ok(window) = builder.build() {
            let _ = window.set_ignore_cursor_events(true);
        }
    }
}

/// Closes and destroys all active overlay windows.
///
/// # Thread Safety
/// Must be called from the Tauri main thread.
pub fn hide_overlays(app_handle: &AppHandle) {
    // Probe and close up to 16 monitor overlays
    for index in 0..16 {
        let label = format!("overlay-{}", index);
        if let Some(window) = app_handle.get_webview_window(&label) {
            let _ = window.close();
        }
    }
}
