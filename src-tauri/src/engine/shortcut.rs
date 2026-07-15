//! Global shortcut manager for hotkey triggers.
//!
//! Uses `tauri-plugin-global-shortcut` (`RegisterHotKey` on Windows) to
//! reliably detect Record-toggle, Start-sequence, and Escape panic hotkeys.
//! This replaces the previous approach of detecting hotkeys inside the
//! low-level `WH_KEYBOARD_LL` hook callback, which was unreliable on
//! Windows 11 due to message-queue timing issues.

use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::{Instant, Duration};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

/// Stores the currently registered record/start shortcuts so we can unregister
/// them before registering replacements.
static CURRENT_SHORTCUTS: OnceLock<Mutex<CurrentShortcuts>> = OnceLock::new();

struct CurrentShortcuts {
    record: Option<Shortcut>,
    start: Option<Shortcut>,
    record_key: String,
    start_key: String,
    record_held: bool,
    start_held: bool,
    last_trigger: Instant,
}

/// Converts our human-readable key name (e.g. "F9", "A", "Space") to a
/// `tauri_plugin_global_shortcut::Code` value.
pub fn key_name_to_code(name: &str) -> Option<Code> {
    let lower = name.to_lowercase();
    match lower.as_str() {
        "f1" => Some(Code::F1),
        "f2" => Some(Code::F2),
        "f3" => Some(Code::F3),
        "f4" => Some(Code::F4),
        "f5" => Some(Code::F5),
        "f6" => Some(Code::F6),
        "f7" => Some(Code::F7),
        "f8" => Some(Code::F8),
        "f9" => Some(Code::F9),
        "f10" => Some(Code::F10),
        "f11" => Some(Code::F11),
        "f12" => Some(Code::F12),
        "f13" => Some(Code::F13),
        "f14" => Some(Code::F14),
        "f15" => Some(Code::F15),
        "f16" => Some(Code::F16),
        "f17" => Some(Code::F17),
        "f18" => Some(Code::F18),
        "f19" => Some(Code::F19),
        "f20" => Some(Code::F20),
        "f21" => Some(Code::F21),
        "f22" => Some(Code::F22),
        "f23" => Some(Code::F23),
        "f24" => Some(Code::F24),
        "space" => Some(Code::Space),
        "enter" => Some(Code::Enter),
        "tab" => Some(Code::Tab),
        "backspace" => Some(Code::Backspace),
        "escape" => Some(Code::Escape),
        "insert" => Some(Code::Insert),
        "delete" => Some(Code::Delete),
        "home" => Some(Code::Home),
        "end" => Some(Code::End),
        "pageup" => Some(Code::PageUp),
        "pagedown" => Some(Code::PageDown),
        "left" => Some(Code::ArrowLeft),
        "up" => Some(Code::ArrowUp),
        "right" => Some(Code::ArrowRight),
        "down" => Some(Code::ArrowDown),
        "capslock" => Some(Code::CapsLock),
        "numlock" => Some(Code::NumLock),
        "scrolllock" => Some(Code::ScrollLock),
        "pause" => Some(Code::Pause),
        "num0" => Some(Code::Numpad0),
        "num1" => Some(Code::Numpad1),
        "num2" => Some(Code::Numpad2),
        "num3" => Some(Code::Numpad3),
        "num4" => Some(Code::Numpad4),
        "num5" => Some(Code::Numpad5),
        "num6" => Some(Code::Numpad6),
        "num7" => Some(Code::Numpad7),
        "num8" => Some(Code::Numpad8),
        "num9" => Some(Code::Numpad9),
        "nummultiply" => Some(Code::NumpadMultiply),
        "numadd" => Some(Code::NumpadAdd),
        "numsubtract" => Some(Code::NumpadSubtract),
        "numdecimal" => Some(Code::NumpadDecimal),
        "numdivide" => Some(Code::NumpadDivide),
        _ => {
            // Single character: letter or digit
            if name.len() == 1 {
                let c = name.chars().next().unwrap().to_ascii_uppercase();
                match c {
                    'A' => Some(Code::KeyA),
                    'B' => Some(Code::KeyB),
                    'C' => Some(Code::KeyC),
                    'D' => Some(Code::KeyD),
                    'E' => Some(Code::KeyE),
                    'F' => Some(Code::KeyF),
                    'G' => Some(Code::KeyG),
                    'H' => Some(Code::KeyH),
                    'I' => Some(Code::KeyI),
                    'J' => Some(Code::KeyJ),
                    'K' => Some(Code::KeyK),
                    'L' => Some(Code::KeyL),
                    'M' => Some(Code::KeyM),
                    'N' => Some(Code::KeyN),
                    'O' => Some(Code::KeyO),
                    'P' => Some(Code::KeyP),
                    'Q' => Some(Code::KeyQ),
                    'R' => Some(Code::KeyR),
                    'S' => Some(Code::KeyS),
                    'T' => Some(Code::KeyT),
                    'U' => Some(Code::KeyU),
                    'V' => Some(Code::KeyV),
                    'W' => Some(Code::KeyW),
                    'X' => Some(Code::KeyX),
                    'Y' => Some(Code::KeyY),
                    'Z' => Some(Code::KeyZ),
                    '0' => Some(Code::Digit0),
                    '1' => Some(Code::Digit1),
                    '2' => Some(Code::Digit2),
                    '3' => Some(Code::Digit3),
                    '4' => Some(Code::Digit4),
                    '5' => Some(Code::Digit5),
                    '6' => Some(Code::Digit6),
                    '7' => Some(Code::Digit7),
                    '8' => Some(Code::Digit8),
                    '9' => Some(Code::Digit9),
                    _ => None,
                }
            } else {
                None
            }
        }
    }
}

/// Initializes the global-shortcut plugin with the main handler.
///
/// The handler dispatches Record-toggle and Start-sequence actions directly,
/// bypassing the low-level hook channel entirely.
pub fn init_global_shortcuts(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    use crate::engine::hook::STATE;

    CURRENT_SHORTCUTS.get_or_init(|| {
        Mutex::new(CurrentShortcuts {
            record: None,
            start: None,
            record_key: "F9".to_string(),
            start_key: "F10".to_string(),
            record_held: false,
            start_held: false,
            last_trigger: Instant::now() - Duration::from_secs(5),
        })
    });

    let app_handle = app.handle().clone();

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, shortcut, event| {
                // Read the current shortcuts to identify which one was triggered
                let mut guard = match CURRENT_SHORTCUTS.get() {
                    Some(m) => match m.lock() {
                        Ok(g) => g,
                        Err(_) => return,
                    },
                    None => return,
                };

                let is_record = guard.record.as_ref().map_or(false, |s| s == shortcut);
                let is_start = guard.start.as_ref().map_or(false, |s| s == shortcut);

                // Handle key release transitions
                if event.state() == ShortcutState::Released {
                    if is_record {
                        guard.record_held = false;
                    }
                    if is_start {
                        guard.start_held = false;
                    }
                    return;
                }

                // Handle key press transitions (detecting/preventing repeats)
                if event.state() == ShortcutState::Pressed {
                    if is_record {
                        if guard.record_held {
                            return; // Already held, ignore repeated auto-repeat event
                        }
                        guard.record_held = true;
                    }
                    if is_start {
                        if guard.start_held {
                            return; // Already held, ignore repeated auto-repeat event
                        }
                        guard.start_held = true;
                    }
                }

                // Debounce cooldown check (backup)
                let now = Instant::now();
                if now.duration_since(guard.last_trigger) < Duration::from_millis(500) {
                    return; // Ignore key repeat bounce
                }
                guard.last_trigger = now;

                let state = STATE.load(Ordering::SeqCst);
                drop(guard); // Release lock before doing work

                if is_record {
                    if state == 0 {
                        // Idle → start recording
                        let _ = crate::commands::start_recording(app_handle.clone());
                    } else if state == 3 {
                        // Recording → stop recording
                        let _ = crate::commands::stop_recording(app_handle.clone());
                    }
                } else if is_start {
                    if state == 0 {
                        // Idle → trigger playback
                        let _ = app_handle.emit("trigger-playback", ());
                    } else if state == 4 {
                        // Playing → stop playback
                        let _ = crate::engine::player::stop_playback();
                    }
                }
            })
            .build(),
    )?;

    Ok(())
}

/// Registers (or re-registers) the Record and Start global shortcuts.
///
/// Unregisters any previously registered shortcuts before registering new ones.
pub fn register_hotkeys(app_handle: &AppHandle, record_key: &str, start_key: &str) -> Result<(), String> {
    let gs = app_handle.global_shortcut();

    let guard = CURRENT_SHORTCUTS
        .get()
        .ok_or("Shortcuts not initialized")?;
    let mut current = guard.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Unregister old shortcuts
    if let Some(old) = current.record.take() {
        let _ = gs.unregister(old);
    }
    if let Some(old) = current.start.take() {
        let _ = gs.unregister(old);
    }

    // Save key strings
    current.record_key = record_key.to_string();
    current.start_key = start_key.to_string();

    // Register new record shortcut
    let record_code = key_name_to_code(record_key)
        .ok_or_else(|| format!("Unknown key for record hotkey: {}", record_key))?;
    let record_shortcut = Shortcut::new(None, record_code);
    gs.register(record_shortcut)
        .map_err(|e| format!("Failed to register record hotkey '{}': {}", record_key, e))?;
    current.record = Some(record_shortcut);

    // Register new start shortcut
    let start_code = key_name_to_code(start_key)
        .ok_or_else(|| format!("Unknown key for start hotkey: {}", start_key))?;
    let start_shortcut = Shortcut::new(None, start_code);
    gs.register(start_shortcut)
        .map_err(|e| format!("Failed to register start hotkey '{}': {}", start_key, e))?;
    current.start = Some(start_shortcut);

    Ok(())
}

/// Unregisters all active global shortcuts.
pub fn unregister_all_hotkeys(app_handle: &AppHandle) -> Result<(), String> {
    let gs = app_handle.global_shortcut();
    let guard = CURRENT_SHORTCUTS
        .get()
        .ok_or("Shortcuts not initialized")?;
    let mut current = guard.lock().map_err(|e| format!("Lock error: {}", e))?;

    if let Some(old) = current.record.take() {
        let _ = gs.unregister(old);
    }
    if let Some(old) = current.start.take() {
        let _ = gs.unregister(old);
    }

    Ok(())
}

/// Re-registers global shortcuts using stored key strings.
pub fn reregister_active_hotkeys(app_handle: &AppHandle) -> Result<(), String> {
    let (record_key, start_key) = {
        let guard = CURRENT_SHORTCUTS
            .get()
            .ok_or("Shortcuts not initialized")?;
        let current = guard.lock().map_err(|e| format!("Lock error: {}", e))?;
        (current.record_key.clone(), current.start_key.clone())
    };

    register_hotkeys(app_handle, &record_key, &start_key)
}
