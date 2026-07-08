//! Tauri command handlers.
//!
//! Bridges the frontend React application with the low-level Rust hooks,
//! playback engine, and filesystem profiles storage. Spawns the central
//! event consumer thread to process asynchronous hook events.

use std::sync::atomic::Ordering;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use crate::engine::hook::{
    set_hook_hotkeys, set_hook_state, HookEvent, RawInputEvent, STATE,
};
use crate::engine::keycodes::{string_to_vk, vk_to_string};
use crate::engine::player::{start_playback, stop_playback};
use crate::engine::recorder::Recorder;
use crate::engine::schema::{MacroProfile, MacroSequence, SequenceItem};


static RECORDER: OnceLock<Mutex<Recorder>> = OnceLock::new();

/// Initializes the global recorder instance. Must be called once on app startup.
pub fn init_recorder() {
    let _ = RECORDER.set(Mutex::new(Recorder::default()));
}

/// Command to start recording macro events.
/// Spawns click-through overlays on all monitors.
#[tauri::command]
pub fn start_recording(app_handle: AppHandle) -> Result<(), String> {
    let state = STATE.load(Ordering::SeqCst);
    if state != 0 {
        return Ok(()); // Already recording or playing, ignore
    }

    set_hook_state(3); // 3 = STATE_RECORDING

    if let Some(r) = RECORDER.get() {
        let mut recorder = r.lock().map_err(|e| format!("failed to lock recorder: {}", e))?;
        recorder.start();
    } else {
        return Err("Recorder not initialized".to_string());
    }

    // Spawn monitor overlays on the main thread
    let handle = app_handle.clone();
    let _ = app_handle.run_on_main_thread(move || {
        crate::engine::overlay::show_overlays(&handle);
    });

    let _ = app_handle.emit("recording-state-changed", true);
    Ok(())
}

/// Command to stop recording macro events.
/// Closes all overlays and returns the compiled SequenceItem.
#[tauri::command]
pub fn stop_recording(app_handle: AppHandle) -> Result<SequenceItem, String> {
    let state = STATE.load(Ordering::SeqCst);
    if state != 3 {
        return Err("Not currently recording".to_string());
    }

    set_hook_state(0); // 0 = STATE_IDLE

    // Close monitor overlays on the main thread
    let handle = app_handle.clone();
    let _ = app_handle.run_on_main_thread(move || {
        crate::engine::overlay::hide_overlays(&handle);
    });

    let item = if let Some(r) = RECORDER.get() {
        let mut recorder = r.lock().map_err(|e| format!("failed to lock recorder: {}", e))?;
        recorder.stop()
    } else {
        return Err("Recorder not initialized".to_string());
    };

    let _ = app_handle.emit("recording-state-changed", false);
    let _ = app_handle.emit("new-recorded-item", &item);
    Ok(item)
}

/// Command to initiate macro playback of the specified sequence.
#[tauri::command]
pub fn start_macro_playback(sequence: MacroSequence, app_handle: AppHandle) -> Result<(), String> {
    start_playback(sequence, app_handle);
    Ok(())
}

/// Command to stop active macro playback.
#[tauri::command]
pub fn stop_macro_playback() -> Result<(), String> {
    let _ = stop_playback();
    Ok(())
}

/// Command to start listening for a hotkey configuration mapping.
#[tauri::command]
pub fn listen_for_hotkey(target: String) -> Result<(), String> {
    let state_val = match target.as_str() {
        "recordToggle" => 1,  // ConfiguringRecord
        "startSequence" => 2, // ConfiguringStart
        _ => return Err("Invalid hotkey target".to_string()),
    };
    set_hook_state(state_val);
    Ok(())
}

/// Command to cancel hotkey listening mode.
#[tauri::command]
pub fn cancel_listen_for_hotkey() -> Result<(), String> {
    set_hook_state(0); // 0 = STATE_IDLE
    Ok(())
}

/// Command to save the current profile configuration.
#[tauri::command]
pub fn save_macro_profile(profile: MacroProfile, app_handle: AppHandle) -> Result<(), String> {
    crate::storage::save_profile(&app_handle, &profile)
}

/// Command to save a profile configuration to a custom file path.
#[tauri::command]
pub fn save_macro_profile_to_path(profile: MacroProfile, path: String) -> Result<(), String> {
    let content = serde_json::to_string_pretty(&profile)
        .map_err(|e| format!("failed to serialize profile: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("failed to write profile file to path {}: {}", path, e))?;
    Ok(())
}

/// Command to load the active profile configuration.
#[tauri::command]
pub fn load_macro_profile(app_handle: AppHandle) -> Result<MacroProfile, String> {
    crate::storage::load_profile(&app_handle)
}

/// Command to load a profile configuration from a custom file path.
#[tauri::command]
pub fn load_macro_profile_from_path(path: String) -> Result<MacroProfile, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path)
        .map_err(|e| format!("failed to open profile file at {}: {}", path, e))?;
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| format!("failed to read profile file: {}", e))?;
    let profile: MacroProfile = serde_json::from_str(&content)
        .map_err(|e| format!("failed to parse profile JSON: {}", e))?;
    Ok(profile)
}

/// Command to apply updated record/start hotkeys to the low-level hook filter and the global shortcut manager.
#[tauri::command]
pub fn update_hook_hotkeys(app_handle: AppHandle, record_key: String, start_key: String) -> Result<(), String> {
    let record_vk = string_to_vk(&record_key)
        .ok_ok_or_else(|| format!("Invalid key name: {}", record_key))?;
    let start_vk = string_to_vk(&start_key)
        .ok_ok_or_else(|| format!("Invalid key name: {}", start_key))?;

    // --- NEW CODE ADDED HERE ---
    // Update the recorder to ignore the record toggle hotkey so it doesn't record its own trigger
    if let Some(r) = RECORDER.get() {
        if let Ok(mut recorder) = r.lock() {
            recorder.set_ignored_keys(std::collections::HashSet::from([record_vk]));
        }
    }
    // ---------------------------

    set_hook_hotkeys(record_vk, start_vk);
    crate::engine::shortcut::register_hotkeys(&app_handle, &record_key, &start_key)?;
    Ok(())
}

/// Extension trait helper for Option to convert to Result.
trait OptionExt<T> {
    fn ok_ok_or_else<F: FnOnce() -> String>(self, err_fn: F) -> Result<T, String>;
}

impl<T> OptionExt<T> for Option<T> {
    fn ok_ok_or_else<F: FnOnce() -> String>(self, err_fn: F) -> Result<T, String> {
        self.ok_or_else(err_fn)
    }
}

/// Spawns the central hook event consumer thread.
/// Handles hotkeys dispatch, record event collection, and escape panic timeout checks.
pub fn start_consumer(rx: crossbeam_channel::Receiver<HookEvent>, app_handle: AppHandle) {
    let _ = thread_builder("event-consumer-thread")
        .spawn(move || {
            loop {
                match rx.recv() {
                    Ok(hook_event) => {
                        let state = STATE.load(Ordering::SeqCst);
                        
                        match hook_event.event {
                            // RecordTogglePressed and StartSequencePressed are handled
                            // by the global shortcut plugin (shortcut.rs), not here.
                            RawInputEvent::RecordTogglePressed | RawInputEvent::StartSequencePressed => {}
                            RawInputEvent::Keyboard { vk, down } => {
                                eprintln!("[CONSUMER] Keyboard: vk = 0x{:X}, down = {}, state = {}", vk, down, state);
                                if state == 1 || state == 2 {
                                    if down {
                                        // Intercept Escape to cancel configuring hotkeys
                                        if vk == 0x1B {
                                            set_hook_state(0);
                                            let _ = app_handle.emit("hotkey-cancelled", ());
                                        } else {
                                            let target = if state == 1 { "recordToggle" } else { "startSequence" };
                                            set_hook_state(0);
                                            let _ = app_handle.emit("hotkey-configured", (target, vk_to_string(vk)));
                                        }
                                    }
                                } else if state == 3 {
                                    if vk == 0x1B {
                                        if down {
                                            eprintln!("[CONSUMER] Escape pressed during recording. Stopping...");
                                            let _ = stop_recording(app_handle.clone());
                                        }
                                    } else if let Some(r) = RECORDER.get() {
                                        if let Ok(mut recorder) = r.lock() {
                                            recorder.record_event(RawInputEvent::Keyboard { vk, down }, hook_event.time);
                                        }
                                    }
                                } else if state == 4 {
                                    if vk == 0x1B {
                                        if down {
                                            eprintln!("[CONSUMER] Escape pressed during playback. Panic stopping...");
                                            let _ = stop_playback();
                                        }
                                    }
                                }
                            }
                            other_event => {
                                if state == 3 {
                                    if let Some(r) = RECORDER.get() {
                                        if let Ok(mut recorder) = r.lock() {
                                            recorder.record_event(other_event, hook_event.time);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(_) => {
                        break;
                    }
                }
            }
        });
}

/// Helper to configure a named thread.
fn thread_builder(name: &str) -> std::thread::Builder {
    std::thread::Builder::new().name(name.to_string())
}
