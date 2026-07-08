//! Macro playback engine.
//!
//! Spawns a dedicated player thread to replay sequences of recorded mouse/keyboard
//! events and manual click actions. Uses Win32 SendInput for simulated inputs.
//! Enforces precise sleeping intervals using multimedia high-resolution timer.

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    MOUSEEVENTF_ABSOLUTE, MOUSE_EVENT_FLAGS, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
    MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_VIRTUALDESK,
    MOUSEINPUT, VIRTUAL_KEY, INPUT_KEYBOARD, INPUT_MOUSE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};

use crate::engine::schema::{MacroSequence, PlaybackEvent, SequenceItem};
use crate::engine::hook::{MouseButton, set_hook_state};
use crate::engine::keycodes::string_to_vk;

/// Atomic flag used to request abort of running macro playback.
pub static PLAYBACK_CANCEL: AtomicBool = AtomicBool::new(false);

/// Helper to simulate a keyboard press or release.
fn send_keyboard_input(vk: u32, down: bool) {
    let mut flags = KEYBD_EVENT_FLAGS(0);
    if !down {
        flags |= KEYEVENTF_KEYUP;
    }
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk as u16),
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    // SAFETY: Executing simulated keyboard input using raw OS calls.
    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

/// Helper to simulate a mouse event (movement or click) with absolute coordinates.
fn send_mouse_input(flags: MOUSE_EVENT_FLAGS, x: i32, y: i32) {
    // SAFETY: Querying system metrics for absolute coordinate mapping.
    let (dx, dy) = unsafe {
        let left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        let w = if width == 0 { 1 } else { width };
        let h = if height == 0 { 1 } else { height };

        // Normalize coords to 0..65535 range for absolute input mapping
        let norm_x = ((x - left) * 65535) / w;
        let norm_y = ((y - top) * 65535) / h;
        (norm_x, norm_y)
    };

    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx,
                dy,
                mouseData: 0,
                dwFlags: flags | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    // SAFETY: Executing simulated mouse event.
    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

/// Dispatches a single PlaybackEvent to the system.
fn execute_playback_event(event: &PlaybackEvent) {
    match event.kind.as_str() {
        "keydown" | "keyup" => {
            if let Some(ref key_name) = event.key {
                if let Some(vk) = string_to_vk(key_name) {
                    let down = event.kind == "keydown";
                    send_keyboard_input(vk, down);
                }
            }
        }
        "mousemove" => {
            if let (Some(x), Some(y)) = (event.x, event.y) {
                send_mouse_input(MOUSEEVENTF_MOVE, x, y);
            }
        }
        "mousedown" | "mouseup" => {
            if let (Some(button), Some(x), Some(y)) = (event.button, event.x, event.y) {
                let flags = match (event.kind.as_str(), button) {
                    ("mousedown", MouseButton::Left) => MOUSEEVENTF_LEFTDOWN,
                    ("mouseup", MouseButton::Left) => MOUSEEVENTF_LEFTUP,
                    ("mousedown", MouseButton::Right) => MOUSEEVENTF_RIGHTDOWN,
                    ("mouseup", MouseButton::Right) => MOUSEEVENTF_RIGHTUP,
                    ("mousedown", MouseButton::Middle) => MOUSEEVENTF_MIDDLEDOWN,
                    ("mouseup", MouseButton::Middle) => MOUSEEVENTF_MIDDLEUP,
                    _ => MOUSE_EVENT_FLAGS(0),
                };
                if flags.0 != 0 {
                    send_mouse_input(flags, x, y);
                }
            }
        }
        _ => {}
    }
}

/// Sleeps for a duration, checking the cancel flag every 10ms.
/// Returns true if cancelled.
fn sleep_check_cancel(total_ms: u32) -> bool {
    let step_ms = 10;
    let mut elapsed = 0;
    while elapsed < total_ms {
        if PLAYBACK_CANCEL.load(Ordering::SeqCst) {
            return true;
        }
        let sleep_time = std::cmp::min(step_ms, total_ms - elapsed);
        thread::sleep(Duration::from_millis(sleep_time as u64));
        elapsed += sleep_time;
    }
    PLAYBACK_CANCEL.load(Ordering::SeqCst)
}

/// Starts execution of the macro sequence on a dedicated thread.
///
/// # Thread Safety
/// Spawns a background thread. Emits tauri events to update the UI on completion.
pub fn start_playback(
    sequence: MacroSequence,
    app_handle: AppHandle,
) {
    PLAYBACK_CANCEL.store(false, Ordering::SeqCst);
    set_hook_state(4); // 4 = STATE_PLAYING

    let _ = thread::Builder::new()
        .name("player-thread".to_string())
        .spawn(move || {
            // Enable high-resolution multimedia timers
            // SAFETY: Call Windows multimedia API to ensure precise thread sleeping.
            unsafe {
                let _ = windows::Win32::Media::timeBeginPeriod(1);
            }
            if sleep_check_cancel(1500) {
                unsafe { let _ = windows::Win32::Media::timeEndPeriod(1); }
                set_hook_state(0);
                let _ = app_handle.emit("playback-state-changed", false);
                return;
            }
            let repeat_config = sequence.repeat.clone();
            let mut loop_count = 0;
            let mut aborted = false;

            loop {
                if PLAYBACK_CANCEL.load(Ordering::SeqCst) {
                    break;
                }

                if repeat_config.mode == "count" && loop_count >= repeat_config.count {
                    break;
                }

                for item in &sequence.items {
                    if PLAYBACK_CANCEL.load(Ordering::SeqCst) {
                        aborted = true;
                        break;
                    }

                    match item {
                        SequenceItem::Manual { key, interval_ms, .. } => {
                            if let Some(vk) = string_to_vk(key) {
                                send_keyboard_input(vk, true);
                                if sleep_check_cancel(*interval_ms) {
                                    aborted = true;
                                    break;
                                }
                                send_keyboard_input(vk, false);
                            }
                        }
                        SequenceItem::Recorded { playback_scale, events, .. } => {
                            let mut prev_t = 0;
                            for event in events {
                                if PLAYBACK_CANCEL.load(Ordering::SeqCst) {
                                    aborted = true;
                                    break;
                                }

                                // Apply scale to event relative timestamp offset
                                let delta_t = (*playback_scale * (event.t - prev_t) as f64) as u32;
                                if delta_t > 0 {
                                    if sleep_check_cancel(delta_t) {
                                        aborted = true;
                                        break;
                                    }
                                }
                                prev_t = event.t;

                                execute_playback_event(event);
                            }
                        }
                    }
                }

                if aborted {
                    break;
                }

                // If infinite loop, loop_count is just incremented, it won't be checked
                loop_count += 1;
            }

            // Restore multimedia timers resolution
            // SAFETY: Restore multimedia timer settings.
            unsafe {
                let _ = windows::Win32::Media::timeEndPeriod(1);
            }

            // Transition state back to Idle
            set_hook_state(0); // 0 = STATE_IDLE

            // Notify frontend that playback finished
            let _ = app_handle.emit("playback-state-changed", false);
        });
}

/// Signals active playback execution to abort immediately.
///
/// # Thread Safety
/// Lock-free atomic write. Thread-safe.
pub fn stop_playback() {
    PLAYBACK_CANCEL.store(true, Ordering::SeqCst);
}
