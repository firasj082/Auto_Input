//! Visual overlay manager.
//!
//! Spawns semi-transparent click-through overlay windows on all connected monitors
//! during Recording mode. Utilizes Tauri's WebviewWindow and Win32 extended styles.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Applies native Win32 extended window styles for transparent click-through.
#[cfg(target_os = "windows")]
fn make_click_through(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
    };
    if let Ok(raw_hwnd) = window.hwnd() {
        // Reconstruct HWND from the raw pointer to bridge Tauri's internal windows crate
        // version with our direct dependency version.
        // SAFETY: The raw pointer from Tauri's hwnd() is a valid window handle.
        let hwnd = HWND(raw_hwnd.0);
        unsafe {
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            let new_ex_style = ex_style | (WS_EX_TRANSPARENT.0 as i32 | WS_EX_LAYERED.0 as i32);
            let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex_style);
        }
    }
}

/// Fallback for compiling on non-Windows platforms.
#[cfg(not(target_os = "windows"))]
fn make_click_through(_window: &tauri::WebviewWindow) {}

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

        // Initialize window builder referencing the frontend with overlay=true parameter
        let url = WebviewUrl::App(format!("index.html?overlay=true&id={}", index).into());
        let builder = WebviewWindowBuilder::new(app_handle, &label, url)
            .title("Recording Overlay")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .resizable(false)
            .position(pos.x as f64 / scale, pos.y as f64 / scale)
            .inner_size(size.width as f64 / scale, size.height as f64 / scale);

        if let Ok(window) = builder.build() {
            // Apply click-through styles
            let _ = window.set_ignore_cursor_events(true);
            make_click_through(&window);
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
