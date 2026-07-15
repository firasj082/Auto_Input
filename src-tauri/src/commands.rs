//! Tauri command handlers.
//!
//! Bridges the frontend React application with the low-level Rust hooks,
//! playback engine, and filesystem profiles storage. Spawns the central
//! event consumer thread to process asynchronous hook events.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use crate::engine::hook::{
    set_hook_hotkeys, set_hook_state, HookEvent, RawInputEvent, STATE,
};
use crate::engine::keycodes::{string_to_vk, vk_to_string};
use crate::engine::player::{start_playback, stop_playback};
use crate::engine::recorder::Recorder;
use crate::engine::schema::{MacroProfile, MacroSequence, SequenceItem, Loadout, LoadoutMetadata, Theme, ThemeColors, AppSettings};
use crate::engine::constants::PANIC_HOLD_MS;
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;

static RECORDER: OnceLock<Mutex<Recorder>> = OnceLock::new();
static PANIC_MONITOR_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Initializes the global recorder instance. Must be called once on app startup.
pub fn init_recorder() {
    let _ = RECORDER.set(Mutex::new(Recorder::default()));
}

/// Spawns the dedicated panic monitor thread if it isn't already running.
pub fn spawn_panic_monitor(app_handle: AppHandle) {
    let spawn_result = std::thread::Builder::new()
        .name("panic-monitor-thread".to_string())
        .spawn(move || {
            let mut hold_start: Option<std::time::Instant> = None;
            loop {
                let state = STATE.load(Ordering::SeqCst);
                if state != 3 && state != 4 {
                    PANIC_MONITOR_ACTIVE.store(false, Ordering::SeqCst);
                    break;
                }

                unsafe {
                    let esc_state = GetAsyncKeyState(0x1b);
                    if (esc_state as u16 & 0x8000) != 0 {
                        match hold_start {
                            Some(start) => {
                                if start.elapsed() >= std::time::Duration::from_millis(PANIC_HOLD_MS) {
                                    eprintln!("[MONITOR] Escape held for {}ms. Triggering panic stop...", PANIC_HOLD_MS);
                                    if state == 3 {
                                        let _ = stop_recording(app_handle.clone());
                                    } else if state == 4 {
                                        let _ = stop_playback();
                                    }
                                    PANIC_MONITOR_ACTIVE.store(false, Ordering::SeqCst);
                                    break;
                                }
                            }
                            None => {
                                hold_start = Some(std::time::Instant::now());
                            }
                        }
                    } else {
                        hold_start = None;
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        });

    if let Err(e) = spawn_result {
        eprintln!("[ERROR] Failed to spawn panic monitor thread: {}", e);
        PANIC_MONITOR_ACTIVE.store(false, Ordering::SeqCst);
    }
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

    if PANIC_MONITOR_ACTIVE.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        spawn_panic_monitor(app_handle.clone());
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
    start_playback(sequence, app_handle.clone());
    if PANIC_MONITOR_ACTIVE.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        spawn_panic_monitor(app_handle);
    }
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
pub fn listen_for_hotkey(target: String, app_handle: AppHandle) -> Result<(), String> {
    let state_val = match target.as_str() {
        "recordToggle" => 1,  // ConfiguringRecord
        "startSequence" => 2, // ConfiguringStart
        _ => return Err("Invalid hotkey target".to_string()),
    };
    let _ = crate::engine::shortcut::unregister_all_hotkeys(&app_handle);
    set_hook_state(state_val);
    Ok(())
}

/// Command to cancel hotkey listening mode.
#[tauri::command]
pub fn cancel_listen_for_hotkey(app_handle: AppHandle) -> Result<(), String> {
    set_hook_state(0); // 0 = STATE_IDLE
    let _ = crate::engine::shortcut::reregister_active_hotkeys(&app_handle);
    Ok(())
}

/// Thin command to unregister all global hotkeys (called during key capture).
#[tauri::command]
pub fn unregister_global_hotkeys(app_handle: AppHandle) -> Result<(), String> {
    crate::engine::shortcut::unregister_all_hotkeys(&app_handle)
}

/// Thin command to re-register stored global hotkeys (called when key capture exits).
#[tauri::command]
pub fn reregister_global_hotkeys(app_handle: AppHandle) -> Result<(), String> {
    crate::engine::shortcut::reregister_active_hotkeys(&app_handle)
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
                                if state == 1 || state == 2 {
                                    if down {
                                        // Intercept Escape to cancel configuring hotkeys
                                        if vk == 0x1B {
                                            set_hook_state(0);
                                            let _ = app_handle.emit("hotkey-cancelled", ());
                                            let _ = crate::engine::shortcut::reregister_active_hotkeys(&app_handle);
                                        } else {
                                            let target = if state == 1 { "recordToggle" } else { "startSequence" };
                                            set_hook_state(0);
                                            let _ = app_handle.emit("hotkey-configured", (target, vk_to_string(vk)));
                                        }
                                    }
                                } else if state == 3 {
                                    // Never record the Escape key (vk = 0x1B) during recording
                                    if vk != 0x1B {
                                        if let Some(r) = RECORDER.get() {
                                            if let Ok(mut recorder) = r.lock() {
                                                recorder.record_event(RawInputEvent::Keyboard { vk, down }, hook_event.time);
                                            }
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

fn get_current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Command to save a Loadout JSON file to the local AppData/Loadouts directory.
#[tauri::command]
pub fn save_loadout(mut loadout: Loadout, app_handle: AppHandle) -> Result<(), String> {
    let dir = crate::storage::get_loadouts_dir(&app_handle)?;
    
    // Ensure parent directory exists
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create loadouts directory: {}", e))?;
    }
    
    let now = get_current_timestamp();
    loadout.last_updated_at = now;
    if loadout.last_used_at == 0 {
        loadout.last_used_at = now;
    }
    
    let path = dir.join(format!("{}.json", loadout.id));
    
    let content = serde_json::to_string_pretty(&loadout)
        .map_err(|e| format!("failed to serialize loadout: {}", e))?;
        
    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("failed to create loadout file: {}", e))?;
        
    use std::io::Write;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("failed to write loadout file: {}", e))?;
        
    Ok(())
}

/// Command to list all local Loadouts from the AppData/Loadouts directory.
#[tauri::command]
pub fn list_loadouts(app_handle: AppHandle) -> Result<Vec<LoadoutMetadata>, String> {
    let dir = crate::storage::get_loadouts_dir(&app_handle)?;
    let mut loadouts = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(mut file) = std::fs::File::open(&path) {
                    let mut content = String::new();
                    use std::io::Read;
                    if file.read_to_string(&mut content).is_ok() {
                        if let Ok(loadout) = serde_json::from_str::<Loadout>(&content) {
                            let total_duration = loadout.sequence.get_total_duration_ms();
                            let total_items = loadout.sequence.items.len() as u32;
                            loadouts.push(LoadoutMetadata {
                                id: loadout.id,
                                name: loadout.name,
                                description: loadout.description,
                                repeat_mode: loadout.sequence.repeat.mode,
                                repeat_count: loadout.sequence.repeat.count,
                                total_items,
                                total_duration_ms: total_duration,
                                last_used_at: loadout.last_used_at,
                                last_updated_at: loadout.last_updated_at,
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Sort primarily by last_used_at descending, secondarily by last_updated_at descending
    loadouts.sort_by(|a, b| {
        b.last_used_at.cmp(&a.last_used_at)
            .then_with(|| b.last_updated_at.cmp(&a.last_updated_at))
    });
    
    Ok(loadouts)
}

/// Command to load a Loadout JSON by ID and update its last_used_at timestamp.
#[tauri::command]
pub fn load_loadout(id: String, app_handle: AppHandle) -> Result<Loadout, String> {
    let dir = crate::storage::get_loadouts_dir(&app_handle)?;
    let path = dir.join(format!("{}.json", id));
    
    if !path.exists() {
        return Err(format!("Loadout with ID '{}' does not exist", id));
    }
    
    let mut file = std::fs::File::open(&path)
        .map_err(|e| format!("failed to open loadout file: {}", e))?;
        
    let mut content = String::new();
    use std::io::Read;
    file.read_to_string(&mut content)
        .map_err(|e| format!("failed to read loadout file: {}", e))?;
        
    let mut loadout: Loadout = serde_json::from_str(&content)
        .map_err(|e| format!("failed to parse loadout JSON: {}", e))?;
        
    // Update last_used_at timestamp and save back to disk
    loadout.last_used_at = get_current_timestamp();
    
    let updated_content = serde_json::to_string_pretty(&loadout)
        .map_err(|e| format!("failed to serialize loadout: {}", e))?;
        
    let mut write_file = std::fs::File::create(&path)
        .map_err(|e| format!("failed to open loadout for writing: {}", e))?;
        
    use std::io::Write;
    write_file.write_all(updated_content.as_bytes())
        .map_err(|e| format!("failed to save updated loadout timestamp: {}", e))?;
        
    Ok(loadout)
}

/// Command to delete a local Loadout file.
#[tauri::command]
pub fn delete_loadout(id: String, app_handle: AppHandle) -> Result<(), String> {
    let dir = crate::storage::get_loadouts_dir(&app_handle)?;
    let path = dir.join(format!("{}.json", id));
    
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| format!("failed to delete loadout file: {}", e))?;
    }
    Ok(())
}

/// Command to import a Loadout JSON from an external path, saving it to local Loadouts dir.
#[tauri::command]
pub fn import_loadout(path: String, app_handle: AppHandle) -> Result<Loadout, String> {
    let mut file = std::fs::File::open(&path)
        .map_err(|e| format!("failed to open file at {}: {}", path, e))?;
        
    let mut content = String::new();
    use std::io::Read;
    file.read_to_string(&mut content)
        .map_err(|e| format!("failed to read imported file: {}", e))?;
        
    let mut loadout: Loadout = serde_json::from_str(&content)
        .map_err(|e| format!("failed to parse loadout JSON: {}", e))?;
        
    // Always generate a fresh UUID for the local import to prevent collisions
    loadout.id = uuid::Uuid::new_v4().to_string();
    
    let now = get_current_timestamp();
    loadout.last_used_at = now;
    loadout.last_updated_at = now;
    
    // Save to local loadouts directory
    save_loadout(loadout.clone(), app_handle)?;
    
    Ok(loadout)
}

/// Command to export a local Loadout JSON by ID to an external path.
#[tauri::command]
pub fn export_loadout(id: String, path: String, app_handle: AppHandle) -> Result<(), String> {
    let dir = crate::storage::get_loadouts_dir(&app_handle)?;
    let file_path = dir.join(format!("{}.json", id));
    
    if !file_path.exists() {
        return Err(format!("Loadout with ID '{}' does not exist", id));
    }
    
    let mut file = std::fs::File::open(&file_path)
        .map_err(|e| format!("failed to open loadout file: {}", e))?;
        
    let mut content = String::new();
    use std::io::Read;
    file.read_to_string(&mut content)
        .map_err(|e| format!("failed to read loadout file: {}", e))?;
        
    let mut dest_file = std::fs::File::create(&path)
        .map_err(|e| format!("failed to create export file: {}", e))?;
        
    use std::io::Write;
    dest_file.write_all(content.as_bytes())
        .map_err(|e| format!("failed to write export file: {}", e))?;
        
    Ok(())
}

fn write_theme_to_disk(theme: &Theme, themes_dir: &std::path::Path) -> Result<(), String> {
    let path = themes_dir.join(format!("{}.json", theme.id));
    let content = serde_json::to_string_pretty(theme)
        .map_err(|e| format!("failed to serialize theme {}: {}", theme.name, e))?;
    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("failed to create theme file {}: {}", theme.name, e))?;
    use std::io::Write;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("failed to write theme file {}: {}", theme.name, e))?;
    Ok(())
}

/// Commands to list all available themes, auto-regenerating the built-in ones.
#[tauri::command]
pub fn list_themes(app_handle: AppHandle) -> Result<Vec<Theme>, String> {
    let dir = crate::storage::get_themes_dir(&app_handle)?;
    
    // Always regenerate built-in themes to prevent drift on app updates
    let default_theme = Theme {
        id: "default".to_string(),
        name: "Default Dark".to_string(),
        is_built_in: true,
        colors: ThemeColors {
            bg_app: "#0d0f14".to_string(),
            bg_panel: "#151821".to_string(),
            bg_elevated: "#1c202b".to_string(),
            border_default: "#242833".to_string(),
            text_primary: "#e8eaed".to_string(),
            text_secondary: "#8b909c".to_string(),
            accent: "#5b8cff".to_string(),
            accent_hover: "#7099ff".to_string(),
            status_recording: "#ff5c5c".to_string(),
            status_playing: "#4ade80".to_string(),
            status_warning: "#f59e0b".to_string(),
        },
    };
    write_theme_to_disk(&default_theme, &dir)?;

    let neon_emerald = Theme {
        id: "neon-emerald".to_string(),
        name: "Neon Emerald".to_string(),
        is_built_in: true,
        colors: ThemeColors {
            bg_app: "#090d10".to_string(),
            bg_panel: "#111823".to_string(),
            bg_elevated: "#1a2635".to_string(),
            border_default: "#26364a".to_string(),
            text_primary: "#e2e8f0".to_string(),
            text_secondary: "#94a3b8".to_string(),
            accent: "#10b981".to_string(),
            accent_hover: "#34d399".to_string(),
            status_recording: "#ff5c5c".to_string(),
            status_playing: "#34d399".to_string(),
            status_warning: "#f59e0b".to_string(),
        },
    };
    write_theme_to_disk(&neon_emerald, &dir)?;

    let royal_amethyst = Theme {
        id: "royal-amethyst".to_string(),
        name: "Royal Amethyst".to_string(),
        is_built_in: true,
        colors: ThemeColors {
            bg_app: "#0b0914".to_string(),
            bg_panel: "#121021".to_string(),
            bg_elevated: "#1c1833".to_string(),
            border_default: "#2b244d".to_string(),
            text_primary: "#f3e8ff".to_string(),
            text_secondary: "#b7b2cf".to_string(),
            accent: "#a855f7".to_string(),
            accent_hover: "#c084fc".to_string(),
            status_recording: "#ff5c5c".to_string(),
            status_playing: "#a855f7".to_string(),
            status_warning: "#f59e0b".to_string(),
        },
    };
    write_theme_to_disk(&royal_amethyst, &dir)?;

    // Scan all json files in directory
    let mut themes = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(mut file) = std::fs::File::open(&path) {
                    let mut content = String::new();
                    use std::io::Read;
                    if file.read_to_string(&mut content).is_ok() {
                        if let Ok(theme) = serde_json::from_str::<Theme>(&content) {
                            themes.push(theme);
                        }
                    }
                }
            }
        }
    }

    // Sort: built-in first, then alphabetical by name
    themes.sort_by(|a, b| {
        b.is_built_in.cmp(&a.is_built_in)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(themes)
}

/// Command to save a custom user theme configuration.
#[tauri::command]
pub fn save_custom_theme(theme: Theme, app_handle: AppHandle) -> Result<(), String> {
    if theme.is_built_in || theme.id == "default" || theme.id == "neon-emerald" || theme.id == "royal-amethyst" {
        return Err("Cannot override built-in themes".to_string());
    }
    let dir = crate::storage::get_themes_dir(&app_handle)?;
    write_theme_to_disk(&theme, &dir)
}

/// Command to delete a custom user theme. Fallback active theme to default if deleted theme was active.
#[tauri::command]
pub fn delete_theme(id: String, app_handle: AppHandle) -> Result<(), String> {
    if id == "default" || id == "neon-emerald" || id == "royal-amethyst" {
        return Err("Cannot delete built-in themes".to_string());
    }

    // Reset theme settings if deleted theme was active
    let settings_path = crate::storage::get_theme_settings_path(&app_handle)?;
    if settings_path.exists() {
        if let Ok(mut file) = std::fs::File::open(&settings_path) {
            let mut content = String::new();
            use std::io::Read;
            if file.read_to_string(&mut content).is_ok() {
                if let Ok(mut settings) = serde_json::from_str::<AppSettings>(&content) {
                    if settings.active_theme_id == id {
                        settings.active_theme_id = "default".to_string();
                        let updated_content = serde_json::to_string_pretty(&settings)
                            .map_err(|e| format!("failed to serialize theme settings: {}", e))?;
                        if let Ok(mut write_file) = std::fs::File::create(&settings_path) {
                            use std::io::Write;
                            let _ = write_file.write_all(updated_content.as_bytes());
                        }
                    }
                }
            }
        }
    }

    let dir = crate::storage::get_themes_dir(&app_handle)?;
    let path = dir.join(format!("{}.json", id));
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| format!("failed to delete theme file: {}", e))?;
    }

    Ok(())
}

/// Command to retrieve theme/app settings. Defaults to activeThemeId = "default" and recordDragMotion = true.
#[tauri::command]
pub fn get_theme_settings(app_handle: AppHandle) -> Result<AppSettings, String> {
    let path = crate::storage::get_theme_settings_path(&app_handle)?;
    if !path.exists() {
        crate::engine::hook::set_record_drag_motion(true);
        return Ok(AppSettings {
            active_theme_id: "default".to_string(),
            record_drag_motion: true,
            when_closed: "minimize".to_string(),
        });
    }

    let mut file = std::fs::File::open(&path)
        .map_err(|e| format!("failed to open theme settings file: {}", e))?;
    let mut content = String::new();
    use std::io::Read;
    file.read_to_string(&mut content)
        .map_err(|e| format!("failed to read theme settings file: {}", e))?;

    let settings: AppSettings = serde_json::from_str(&content)
        .map_err(|e| format!("failed to parse theme settings: {}", e))?;

    // Synchronize global hook preference
    crate::engine::hook::set_record_drag_motion(settings.record_drag_motion);

    Ok(settings)
}

/// Command to save theme/app settings.
#[tauri::command]
pub fn save_theme_settings(settings: AppSettings, app_handle: AppHandle) -> Result<(), String> {
    // Synchronize global hook preference
    crate::engine::hook::set_record_drag_motion(settings.record_drag_motion);

    let path = crate::storage::get_theme_settings_path(&app_handle)?;
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("failed to serialize theme settings: {}", e))?;

    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("failed to create theme settings file: {}", e))?;
    use std::io::Write;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("failed to write theme settings: {}", e))?;

    Ok(())
}
