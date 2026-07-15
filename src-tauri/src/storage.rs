//! Profile and settings storage.
//!
//! Handles persistence of macro profiles and hotkey configurations to the filesystem
//! under the application's dedicated AppData directory.

use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::engine::schema::MacroProfile;

/// Gets the absolute path to the default settings profile file in AppData.
///
/// # Errors
/// Returns an error string if the Tauri path resolver fails.
fn get_profile_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data directory: {}", e))?;
    
    // Ensure parent directory exists
    if !path.exists() {
        create_dir_all(&path)
            .map_err(|e| format!("failed to create app data directory: {}", e))?;
    }
    
    path.push("profile.json");
    Ok(path)
}

/// Loads the active macro profile from disk.
/// Falls back to the default profile if no file exists.
///
/// # Errors
/// Returns an error string if reading or deserialization fails.
pub fn load_profile(app_handle: &AppHandle) -> Result<MacroProfile, String> {
    let path = get_profile_path(app_handle)?;
    if !path.exists() {
        return Ok(MacroProfile::default());
    }

    let mut file = File::open(&path)
        .map_err(|e| format!("failed to open profile file: {}", e))?;
    
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| format!("failed to read profile file: {}", e))?;

    let profile: MacroProfile = serde_json::from_str(&content)
        .map_err(|e| format!("failed to parse profile JSON: {}", e))?;

    Ok(profile)
}

/// Saves the macro profile to disk.
///
/// # Errors
/// Returns an error string if file creation or serialization fails.
pub fn save_profile(app_handle: &AppHandle, profile: &MacroProfile) -> Result<(), String> {
    let path = get_profile_path(app_handle)?;
    
    let content = serde_json::to_string_pretty(profile)
        .map_err(|e| format!("failed to serialize profile: {}", e))?;

    let mut file = File::create(&path)
        .map_err(|e| format!("failed to create profile file: {}", e))?;
    
    file.write_all(content.as_bytes())
        .map_err(|e| format!("failed to write profile file: {}", e))?;

    Ok(())
}

/// Resolves the absolute path to the local Loadouts folder in AppData, creating it if necessary.
pub fn get_loadouts_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data directory: {}", e))?;
    
    path.push("Loadouts");
    
    // Ensure Loadouts directory exists
    if !path.exists() {
        create_dir_all(&path)
            .map_err(|e| format!("failed to create Loadouts directory: {}", e))?;
    }
    
    Ok(path)
}

/// Resolves the absolute path to the local Themes folder in AppData, creating it if necessary.
pub fn get_themes_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data directory: {}", e))?;
    
    path.push("Themes");
    
    // Ensure Themes directory exists
    if !path.exists() {
        create_dir_all(&path)
            .map_err(|e| format!("failed to create Themes directory: {}", e))?;
    }
    
    Ok(path)
}

/// Resolves the absolute path to the theme_settings.json file in AppData.
pub fn get_theme_settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data directory: {}", e))?;
    
    path.push("theme_settings.json");
    Ok(path)
}
