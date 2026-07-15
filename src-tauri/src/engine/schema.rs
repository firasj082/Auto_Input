//! Macro data schema definition.
//!
//! Serves as the single source of truth for the structure of actions, action sets,
//! sequences, and configuration files. Must be kept in sync with the frontend types.

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::engine::hook::MouseButton;

/// Representation of a single event in a recorded action set.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackEvent {
    /// Milliseconds offset since the beginning of this action set's recording.
    pub t: u32,
    /// Type of event: "keydown", "keyup", "mousemove", "mousedown", "mouseup"
    pub kind: String,
    /// Associated key name for keyboard events, if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// Mouse button pressed or released, if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button: Option<MouseButton>,
    /// Absolute horizontal screen coordinate, if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    /// Absolute vertical screen coordinate, if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
}

/// An entry in the sequence list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SequenceItem {
    /// A single manual click/keypress action.
    #[serde(rename = "manual")]
    Manual {
        /// Unique identifier for UI tracking and reordering.
        id: String,
        /// Key name to send (e.g. "Space").
        key: String,
        /// Duration of this item's interval in milliseconds.
        #[serde(rename = "intervalMs")]
        interval_ms: u32,
        /// The action mode (click, hold, doubleclick)
        #[serde(rename = "actionMode", default = "default_action_mode")]
        action_mode: String,
        /// Whether the action is enabled
        #[serde(default = "default_enabled")]
        enabled: bool,
    },
    /// A set of recorded keyboard and mouse events.
    #[serde(rename = "recorded")]
    Recorded {
        /// Unique identifier.
        id: String,
        /// Human-readable label for display in the UI.
        label: String,
        /// Original duration of the recording in milliseconds.
        #[serde(rename = "originalDurationMs")]
        original_duration_ms: u32,
        /// Scaling multiplier to compress or stretch playback speed (default: 1.0).
        #[serde(rename = "playbackScale")]
        playback_scale: f64,
        /// List of internal micro-events to replay.
        events: Vec<PlaybackEvent>,
        /// Whether the action set is enabled
        #[serde(default = "default_enabled")]
        enabled: bool,
    },
}

/// Sequence-level loop configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepeatConfig {
    /// Loop mode: "count" or "infinite"
    pub mode: String,
    /// Number of repeats if mode is "count".
    pub count: u32,
}

/// Sequence-level hotkeys configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeysConfig {
    /// Hotkey to toggle recording (e.g. "F9")
    #[serde(rename = "recordToggle")]
    pub record_toggle: String,
    /// Hotkey to trigger playback (e.g. "F10")
    #[serde(rename = "startSequence")]
    pub start_sequence: String,
}

/// Full structure of the macro sequence editor document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroSequence {
    /// Loop repeat configuration.
    pub repeat: RepeatConfig,
    /// Ordered list of manual click actions or recorded action sets.
    pub items: Vec<SequenceItem>,
}

impl MacroSequence {
    pub fn get_total_duration_ms(&self) -> u32 {
        let mut total = 0;
        for item in &self.items {
            match item {
                SequenceItem::Manual { interval_ms, .. } => {
                    total += interval_ms;
                }
                SequenceItem::Recorded { original_duration_ms, playback_scale, .. } => {
                    total += (*original_duration_ms as f64 * playback_scale) as u32;
                }
            }
        }
        total
    }
}

/// Root data profile document persisted on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroProfile {
    /// Schema format version for forward-compatibility.
    pub version: u32,
    /// Application identifier.
    #[serde(rename = "appId")]
    pub app_id: String,
    /// Global hotkey bindings.
    pub hotkeys: HotkeysConfig,
    /// The macro sequence data.
    pub sequence: MacroSequence,
}

impl Default for MacroProfile {
    fn default() -> Self {
        Self {
            version: 1,
            app_id: "macro-app".to_string(),
            hotkeys: HotkeysConfig {
                record_toggle: "F9".to_string(),
                start_sequence: "F10".to_string(),
            },
            sequence: MacroSequence {
                repeat: RepeatConfig {
                    mode: "count".to_string(),
                    count: 1,
                },
                items: Vec::new(),
            },
        }
    }
}

impl SequenceItem {
    /// Helper to generate a new manual click action item.
    pub fn new_manual(key: String, interval_ms: u32) -> Self {
        Self::Manual {
            id: Uuid::new_v4().to_string(),
            key,
            interval_ms,
            action_mode: "click".to_string(),
            enabled: true,
        }
    }
}

fn default_action_mode() -> String {
    "click".to_string()
}

fn default_enabled() -> bool {
    true
}

/// A saved Loadout containing a sequence and metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Loadout {
    pub id: String,
    pub name: String,
    pub description: String,
    pub sequence: MacroSequence,
    pub version: u32,
    #[serde(rename = "lastUsedAt")]
    pub last_used_at: u64,
    #[serde(rename = "lastUpdatedAt")]
    pub last_updated_at: u64,
}

/// Compact metadata representing a Loadout.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadoutMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "repeatMode")]
    pub repeat_mode: String,
    #[serde(rename = "repeatCount")]
    pub repeat_count: u32,
    #[serde(rename = "totalItems")]
    pub total_items: u32,
    #[serde(rename = "totalDurationMs")]
    pub total_duration_ms: u32,
    #[serde(rename = "lastUsedAt")]
    pub last_used_at: u64,
    #[serde(rename = "lastUpdatedAt")]
     pub last_updated_at: u64,
}

/// Dynamic theme color token values.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColors {
    #[serde(rename = "bgApp")]
    pub bg_app: String,
    #[serde(rename = "bgPanel")]
    pub bg_panel: String,
    #[serde(rename = "bgElevated")]
    pub bg_elevated: String,
    #[serde(rename = "borderDefault")]
    pub border_default: String,
    #[serde(rename = "textPrimary")]
    pub text_primary: String,
    #[serde(rename = "textSecondary")]
    pub text_secondary: String,
    pub accent: String,
    #[serde(rename = "accentHover")]
    pub accent_hover: String,
    #[serde(rename = "statusRecording")]
    pub status_recording: String,
    #[serde(rename = "statusPlaying")]
    pub status_playing: String,
    #[serde(rename = "statusWarning")]
    pub status_warning: String,
}

/// A theme definition mapping to a theme JSON file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theme {
    pub id: String,
    pub name: String,
    #[serde(rename = "isBuiltIn")]
    pub is_built_in: bool,
    pub colors: ThemeColors,
}

/// User's dynamic application settings preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "activeThemeId")]
    pub active_theme_id: String,
    #[serde(rename = "recordDragMotion")]
    pub record_drag_motion: bool,
    #[serde(rename = "whenClosed", default = "default_when_closed")]
    pub when_closed: String,
}

fn default_when_closed() -> String {
    "minimize".to_string()
}
