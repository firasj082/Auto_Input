//! Macro playback engine.
//!
//! Spawns a dedicated player thread to replay sequences of recorded mouse/keyboard
//! events and manual click actions. Uses Win32 SendInput for simulated inputs.
//! Enforces precise sleeping intervals using multimedia high-resolution timer.

use crate::engine::constants::MIN_HOLD_MS;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};
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
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, GetCursorPos,
};
use windows::Win32::Foundation::POINT;

use crate::engine::schema::{MacroSequence, PlaybackEvent, SequenceItem};
use crate::engine::hook::{MouseButton, set_hook_state};
use crate::engine::keycodes::string_to_vk;

/// Atomic flag used to request abort of running macro playback.
pub static PLAYBACK_CANCEL: AtomicBool = AtomicBool::new(false);

/// True while a playback thread is actively running. Makes `start_playback`
/// idempotent — a re-entrant call (e.g. a synthetic key dispatched by
/// playback looping back through a global hotkey, or a UI button firing
/// twice) is ignored instead of spawning a second, overlapping player
/// thread, which is what causes a single recorded key to be replayed
/// more than once.
pub static PLAYBACK_ACTIVE: AtomicBool = AtomicBool::new(false);

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
        "mousedown" => {
            if let (Some(button), Some(x), Some(y)) = (event.button, event.x, event.y) {
                // Move mouse to click position first
                send_mouse_input(MOUSEEVENTF_MOVE, x, y);
                // Brief pause before clicking (10ms)
                thread::sleep(Duration::from_millis(10));
                let flags = match button {
                    MouseButton::Left => MOUSEEVENTF_LEFTDOWN,
                    MouseButton::Right => MOUSEEVENTF_RIGHTDOWN,
                    MouseButton::Middle => MOUSEEVENTF_MIDDLEDOWN,
                };
                send_mouse_input(flags, x, y);
            }
        }
        "mouseup" => {
            if let (Some(button), Some(x), Some(y)) = (event.button, event.x, event.y) {
                let flags = match button {
                    MouseButton::Left => MOUSEEVENTF_LEFTUP,
                    MouseButton::Right => MOUSEEVENTF_RIGHTUP,
                    MouseButton::Middle => MOUSEEVENTF_MIDDLEUP,
                };
                send_mouse_input(flags, x, y);
            }
        }
        _ => {}
    }
}

/// Replays a single recorded action-set (`SequenceItem::Recorded`).
///
/// Applies the sequence's `playback_scale` to the gaps between events, and
/// enforces `MIN_HOLD_MS` as a floor on every physical press so a scaled-down
/// or naturally fast down→up pair still registers as a real press in the
/// target application/game.
///
/// Returns `true` if playback was cancelled partway through.
fn play_recorded_events(events: &[PlaybackEvent], playback_scale: f64) -> bool {
    // Instant each key/button went down, keyed by a namespaced id so a key
    // name (e.g. "A") can never collide with a mouse button's debug string.
    let mut last_down_time: std::collections::HashMap<String, Instant> =
        std::collections::HashMap::new();
    let mut prev_t: u32 = 0;

    for event in events {
        if PLAYBACK_CANCEL.load(Ordering::SeqCst) {
            return true;
        }

        // Apply scale to the event's relative timestamp offset.
        let delta_t = (playback_scale * (event.t - prev_t) as f64) as u32;
        if delta_t > 0 && sleep_check_cancel(delta_t) {
            return true;
        }
        prev_t = event.t;

        // If this is a release, look up when the matching press landed.
        let held_id = match event.kind.as_str() {
            "keyup" => event.key.as_ref().map(|k| format!("key:{}", k)),
            "mouseup" => event.button.map(|b| format!("mouse:{:?}", b)),
            _ => None,
        };

        if let Some(id) = held_id {
            if let Some(down_at) = last_down_time.remove(&id) {
                let held_ms = down_at.elapsed().as_millis() as u32;
                if held_ms < MIN_HOLD_MS && sleep_check_cancel(MIN_HOLD_MS - held_ms) {
                    return true;
                }
            }
        }

        execute_playback_event(event);

        // Record dispatch time AFTER sending the down event, so "held" is
        // measured from when the OS actually saw the press.
        match event.kind.as_str() {
            "keydown" => {
                if let Some(ref key_name) = event.key {
                    last_down_time.insert(format!("key:{}", key_name), Instant::now());
                }
            }
            "mousedown" => {
                if let Some(button) = event.button {
                    last_down_time.insert(format!("mouse:{:?}", button), Instant::now());
                }
            }
            _ => {}
        }
    }

    false
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

/// Safely releases only the mouse buttons that were used during playback.
fn send_mouse_release_for_safety(buttons: &std::collections::HashSet<MouseButton>) {
    let mut inputs = Vec::new();
    if buttons.contains(&MouseButton::Left) {
        inputs.push(INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_LEFTUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }
    if buttons.contains(&MouseButton::Right) {
        inputs.push(INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_RIGHTUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }
    if buttons.contains(&MouseButton::Middle) {
        inputs.push(INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_MIDDLEUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }
    if !inputs.is_empty() {
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }
}


/// Starts execution of the macro sequence on a dedicated thread.
///
/// # Thread Safety
/// Spawns a background thread. Emits tauri events to update the UI on completion.
pub fn start_playback(
    sequence: MacroSequence,
    app_handle: AppHandle,
) {

    if PLAYBACK_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    PLAYBACK_CANCEL.store(false, Ordering::SeqCst);
    set_hook_state(4); // 4 = STATE_PLAYING

    let spawn_result = thread::Builder::new()
        .name("player-thread".to_string())
        .spawn(move || {
            // Collect all keyboard keys and mouse buttons used in the sequence for release on cancel/completion
            let mut keys_to_release = std::collections::HashSet::new();
            let mut mouse_buttons_to_release = std::collections::HashSet::new();

            for item in &sequence.items {
                let is_enabled = match item {
                    SequenceItem::Manual { enabled, .. } => *enabled,
                    SequenceItem::Recorded { enabled, .. } => *enabled,
                };
                if !is_enabled {
                    continue;
                }

                match item {
                    SequenceItem::Manual { key, .. } => {
                        let lower = key.to_lowercase();
                        if lower == "mouseleft" {
                            mouse_buttons_to_release.insert(MouseButton::Left);
                        } else if lower == "mouseright" {
                            mouse_buttons_to_release.insert(MouseButton::Right);
                        } else if lower == "mousemiddle" {
                            mouse_buttons_to_release.insert(MouseButton::Middle);
                        } else {
                            // Split composite key combo
                            for part in key.split(" + ") {
                                if let Some(vk) = string_to_vk(part) {
                                    keys_to_release.insert(vk);
                                }
                            }
                        }
                    }
                    SequenceItem::Recorded { events, .. } => {
                        for event in events {
                            if event.kind == "keydown" {
                                if let Some(ref key_name) = event.key {
                                    if let Some(vk) = string_to_vk(key_name) {
                                        keys_to_release.insert(vk);
                                    }
                                }
                            } else if event.kind == "mousedown" {
                                if let Some(button) = event.button {
                                    mouse_buttons_to_release.insert(button);
                                }
                            }
                        }
                    }
                }
            }

            // Enable high-resolution multimedia timers
            // SAFETY: Call Windows multimedia API to ensure precise thread sleeping.
            unsafe {
                let _ = windows::Win32::Media::timeBeginPeriod(1);
            }

            if sleep_check_cancel(1500) {
                for &vk in &keys_to_release {
                    send_keyboard_input(vk, false);
                }
                send_mouse_release_for_safety(&mouse_buttons_to_release);

                unsafe { let _ = windows::Win32::Media::timeEndPeriod(1); }
                set_hook_state(0);
                let _ = app_handle.emit("playback-state-changed", false);
                PLAYBACK_ACTIVE.store(false, Ordering::SeqCst);
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

                    let is_enabled = match item {
                        SequenceItem::Manual { enabled, .. } => *enabled,
                        SequenceItem::Recorded { enabled, .. } => *enabled,
                    };
                    if !is_enabled {
                        continue;
                    }

                    match item {
                        SequenceItem::Manual { key, interval_ms, action_mode, .. } => {
                            let is_mouse = key.to_lowercase().starts_with("mouse");
                            if is_mouse {
                                let mut pt = POINT::default();
                                unsafe {
                                    let _ = GetCursorPos(&mut pt);
                                }
                                
                                let (down_flags, up_flags) = match key.to_lowercase().as_str() {
                                    "mouseleft" => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                                    "mouseright" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                                    "mousemiddle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
                                    _ => (MOUSE_EVENT_FLAGS(0), MOUSE_EVENT_FLAGS(0)),
                                };

                                match action_mode.as_str() {
                                    "hold" | "click" => {
                                        send_mouse_input(down_flags, pt.x, pt.y);
                                        if sleep_check_cancel(*interval_ms) {
                                            aborted = true;
                                            break;
                                        }
                                        send_mouse_input(up_flags, pt.x, pt.y);
                                    }
                                    "doubleclick" => {
                                        send_mouse_input(down_flags, pt.x, pt.y);
                                        if sleep_check_cancel(MIN_HOLD_MS) { aborted = true; break; }
                                        send_mouse_input(up_flags, pt.x, pt.y);
                                        if sleep_check_cancel(50) { aborted = true; break; }
                                        send_mouse_input(down_flags, pt.x, pt.y);
                                        if sleep_check_cancel(MIN_HOLD_MS) { aborted = true; break; }
                                        send_mouse_input(up_flags, pt.x, pt.y);
                                        let remaining = interval_ms.saturating_sub(MIN_HOLD_MS * 2 + 50);
                                        if remaining > 0 && sleep_check_cancel(remaining) {
                                            aborted = true;
                                            break;
                                        }
                                    }
                                    _ => {}
                                }
                            } else {
                                // Split by " + " for composite keys
                                let parts: Vec<&str> = key.split(" + ").collect();
                                let vks: Vec<u32> = parts.iter().filter_map(|p| string_to_vk(p)).collect();
                                if !vks.is_empty() {
                                    match action_mode.as_str() {
                                        "hold" | "click" => {
                                            for &vk in &vks {
                                                send_keyboard_input(vk, true);
                                            }
                                            if sleep_check_cancel(*interval_ms) {
                                                aborted = true;
                                                break;
                                            }
                                            for &vk in vks.iter().rev() {
                                                send_keyboard_input(vk, false);
                                            }
                                        }
                                        "doubleclick" => {
                                            for &vk in &vks {
                                                send_keyboard_input(vk, true);
                                            }
                                            if sleep_check_cancel(MIN_HOLD_MS) { aborted = true; break; }
                                            for &vk in vks.iter().rev() {
                                                send_keyboard_input(vk, false);
                                            }
                                            if sleep_check_cancel(50) { aborted = true; break; }
                                            for &vk in &vks {
                                                send_keyboard_input(vk, true);
                                            }
                                            if sleep_check_cancel(MIN_HOLD_MS) { aborted = true; break; }
                                            for &vk in vks.iter().rev() {
                                                send_keyboard_input(vk, false);
                                            }
                                            let remaining = interval_ms.saturating_sub(MIN_HOLD_MS * 2 + 50);
                                            if remaining > 0 && sleep_check_cancel(remaining) {
                                                aborted = true;
                                                break;
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                        SequenceItem::Recorded { playback_scale, events, .. } => {
                            if play_recorded_events(events, *playback_scale) {
                                aborted = true;
                                break;
                            }
                        }
                    }
                }

                if aborted {
                    break;
                }

                loop_count += 1;
            }

            // Release all for safety
            for &vk in &keys_to_release {
                send_keyboard_input(vk, false);
            }
            send_mouse_release_for_safety(&mouse_buttons_to_release);

            // Restore multimedia timers resolution
            // SAFETY: Restore multimedia timer settings.
            unsafe {
                let _ = windows::Win32::Media::timeEndPeriod(1);
            }

            // Transition state back to Idle
            set_hook_state(0); // 0 = STATE_IDLE

            // Notify frontend that playback finished
            let _ = app_handle.emit("playback-state-changed", false);
            PLAYBACK_ACTIVE.store(false, Ordering::SeqCst);
        });

            // If the OS couldn't spawn the thread at all, the cleanup inside the
    // closure never runs — reset the guards here or the app stays wedged,
    // refusing all future playback.
    if spawn_result.is_err() {
        PLAYBACK_ACTIVE.store(false, Ordering::SeqCst);
        set_hook_state(0);
    }
}

/// Signals active playback execution to abort immediately.
///
/// # Thread Safety
/// Lock-free atomic write. Thread-safe.
pub fn stop_playback() {
    PLAYBACK_CANCEL.store(true, Ordering::SeqCst);
}
