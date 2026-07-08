//! Low-level Win32 input hook.
//!
//! Installs global system hooks for keyboard and mouse events using SetWindowsHookExW.
//! Events are forwarded off the OS message thread via crossbeam-channel.
//! Filters synthetic/injected inputs to avoid recursive loops.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::OnceLock;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    TranslateMessage, DispatchMessageW, PeekMessageW, PM_NOREMOVE,
    KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WH_MOUSE_LL,
    WM_KEYDOWN, WM_SYSKEYDOWN,
    WM_LBUTTONDOWN, WM_LBUTTONUP, WM_RBUTTONDOWN, WM_RBUTTONUP,
    WM_MBUTTONDOWN, WM_MBUTTONUP, HHOOK,
};

use crate::engine::constants::{LLKHF_INJECTED, LLMHF_INJECTED};

/// Mouse buttons mapped by the hook.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    /// Left click button.
    Left,
    /// Right click button.
    Right,
    /// Scroll wheel button.
    Middle,
}

/// Standardized input events captured by the engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RawInputEvent {
    /// Keyboard key event.
    Keyboard {
        /// Virtual keycode.
        vk: u32,
        /// True if key is pressed down, false if released.
        down: bool,
    },
    /// Mouse pointer movement.
    MouseMove {
        /// Absolute horizontal screen coordinate.
        x: i32,
        /// Absolute vertical screen coordinate.
        y: i32,
    },
    /// Mouse button press down.
    MouseDown {
        /// Which mouse button was pressed.
        button: MouseButton,
        /// Absolute horizontal screen coordinate.
        x: i32,
        /// Absolute vertical screen coordinate.
        y: i32,
    },
    /// Mouse button release.
    MouseUp {
        /// Which mouse button was released.
        button: MouseButton,
        /// Absolute horizontal screen coordinate.
        x: i32,
        /// Absolute vertical screen coordinate.
        y: i32,
    },
    /// Signal event: Record Toggle hotkey pressed.
    RecordTogglePressed,
    /// Signal event: Start Playback hotkey pressed.
    StartSequencePressed,
}

/// Timestamped event wrapper for internal channel communication.
#[derive(Debug, Clone)]
pub struct HookEvent {
    /// The captured input event.
    pub event: RawInputEvent,
    /// The high-precision timestamp when the event was received.
    pub time: Instant,
}

// Global thread-safe configurations for the hook callbacks
pub static STATE: AtomicU32 = AtomicU32::new(0); // 0=Idle, 1=ConfiguringRecord, 2=ConfiguringStart, 3=Recording, 4=Playing
static RECORD_TOGGLE_VK: AtomicU32 = AtomicU32::new(0x78); // VK_F9
static START_SEQUENCE_VK: AtomicU32 = AtomicU32::new(0x79); // VK_F10

// Channel sender for forwarding hook events to the consumer thread
static EVENT_TX: OnceLock<crossbeam_channel::Sender<HookEvent>> = OnceLock::new();

// Global hook handles stored to uninstall hooks on shutdown
static mut KEYBOARD_HOOK: Option<HHOOK> = None;
static mut MOUSE_HOOK: Option<HHOOK> = None;

/// Sets the active state of the hook filter.
///
/// # Thread Safety
/// Thread-safe lock-free atomic write. Does not block.
pub fn set_hook_state(state_val: u32) {
    STATE.store(state_val, Ordering::SeqCst);
}

/// Sets the hotkeys that the hook should intercept and swallow.
///
/// # Thread Safety
/// Thread-safe lock-free atomic write. Does not block.
pub fn set_hook_hotkeys(record_vk: u32, start_vk: u32) {
    RECORD_TOGGLE_VK.store(record_vk, Ordering::SeqCst);
    START_SEQUENCE_VK.store(start_vk, Ordering::SeqCst);
}

/// Low-level keyboard hook callback procedure.
///
/// Filters out injected events and intercepts hotkeys synchronously.
unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let data = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        
        // Filter out injected input (e.g. from our own SendInput simulation)
        if (data.flags.0 & LLKHF_INJECTED) != 0 {
            // SAFETY: Forwarding synthetic inputs to prevent feedback loops
            return CallNextHookEx(None, code, wparam, lparam);
        }

        let vk = data.vkCode;
        let down = wparam.0 as u32 == WM_KEYDOWN as u32 || wparam.0 as u32 == WM_SYSKEYDOWN as u32;
        
        let state = STATE.load(Ordering::SeqCst);
        if state != 0 {
            eprintln!("[KEYHOOK] vk: 0x{:X}, down: {}, state: {}", vk, down, state);
        }
        let mut swallow = false;

        // 1 & 2 represent Configuring states (ConfiguringRecord & ConfiguringStart)
        if state == 1 || state == 2 {
            // Do NOT swallow the key or send it to the event channel.
            // Let it pass through to the WebView so the browser's keydown handler captures it.
            swallow = false;
        } else {
            // Only send standard keyboard events if recording, or if playing and the key is ESC (panic key)
            if state == 3 || (state == 4 && vk == 0x1B) {
                if vk == 0x1B {
                    swallow = true;
                }
                if let Some(tx) = EVENT_TX.get() {
                    let _ = tx.try_send(HookEvent {
                        event: RawInputEvent::Keyboard { vk, down },
                        time: Instant::now(),
                    });
                }
            }
        }

        if swallow {
            return LRESULT(1);
        }
    }
    
    // SAFETY: Standard delegation to the next hook in the Windows hook chain.
    CallNextHookEx(None, code, wparam, lparam)
}

/// Low-level mouse hook callback procedure.
///
/// Captures coordinates and buttons if recording. Filters injected inputs.
unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let data = &*(lparam.0 as *const MSLLHOOKSTRUCT);

        // Filter out injected input (e.g. from our own simulated output)
        if (data.flags & LLMHF_INJECTED) != 0 {
            // SAFETY: Propagate synthetic clicks to prevent lockups.
            return CallNextHookEx(None, code, wparam, lparam);
        }

        let state = STATE.load(Ordering::SeqCst);
        
        // 3 represents Recording state
        if state == 3 {
            let x = data.pt.x;
            let y = data.pt.y;
            let msg = wparam.0 as u32;

            let event = match msg {
                WM_LBUTTONDOWN => Some(RawInputEvent::MouseDown { button: MouseButton::Left, x, y }),
                WM_LBUTTONUP => Some(RawInputEvent::MouseUp { button: MouseButton::Left, x, y }),
                WM_RBUTTONDOWN => Some(RawInputEvent::MouseDown { button: MouseButton::Right, x, y }),
                WM_RBUTTONUP => Some(RawInputEvent::MouseUp { button: MouseButton::Right, x, y }),
                WM_MBUTTONDOWN => Some(RawInputEvent::MouseDown { button: MouseButton::Middle, x, y }),
                WM_MBUTTONUP => Some(RawInputEvent::MouseUp { button: MouseButton::Middle, x, y }),
                _ => None,
            };

            if let Some(evt) = event {
                if let Some(tx) = EVENT_TX.get() {
                    let _ = tx.try_send(HookEvent {
                        event: evt,
                        time: Instant::now(),
                    });
                }
            }
        }
    }

    // SAFETY: Standard delegation to the next hook in the Windows hook chain.
    CallNextHookEx(None, code, wparam, lparam)
}

/// Initializes and starts the low-level Windows keyboard and mouse hooks.
/// Spawns a named thread running the Win32 message pump.
///
/// # Errors
/// Returns an error string if thread creation or hook registration fails.
pub fn start_hooks(tx: crossbeam_channel::Sender<HookEvent>) -> Result<(), String> {
    EVENT_TX.set(tx).map_err(|_| "Hooks channel already initialized".to_string())?;

    std::thread::Builder::new()
        .name("hook-thread".to_string())
        .spawn(move || {
            // SAFETY: Accessing Win32 API to register system hooks.
            unsafe {
                // Force the creation of a message queue for this background thread
                let mut msg = MSG::default();
                let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);

                let khook = SetWindowsHookExW(
                    WH_KEYBOARD_LL,
                    Some(keyboard_proc),
                    None,
                    0,
                ).expect("failed to set low-level keyboard hook");
                
                let mhook = SetWindowsHookExW(
                    WH_MOUSE_LL,
                    Some(mouse_proc),
                    None,
                    0,
                ).expect("failed to set low-level mouse hook");

                KEYBOARD_HOOK = Some(khook);
                MOUSE_HOOK = Some(mhook);

                // Start Win32 message loop to process hook events
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    let _ = DispatchMessageW(&msg);
                }

                // Uninstall hooks on shutdown
                if let Some(kh) = KEYBOARD_HOOK {
                    let _ = UnhookWindowsHookEx(kh);
                }
                if let Some(mh) = MOUSE_HOOK {
                    let _ = UnhookWindowsHookEx(mh);
                }
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}
