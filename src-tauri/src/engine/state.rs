//! Application state machine.
//!
//! Manages the current engine mode (Idle, Configuring, Recording, or Playing)
//! and the active global hotkey bindings. Exposes thread-safe transitions.

use serde::{Deserialize, Serialize};

/// Target hotkey field being configured.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HotkeyTarget {
    /// Hotkey to start or stop recording.
    RecordToggle,
    /// Hotkey to start or stop playback.
    StartSequence,
}

/// Active mode of the macro engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AppState {
    /// App is ready and listening for global hotkeys.
    Idle,
    /// App is capturing the next pressed key to assign to a hotkey target.
    Configuring { 
        /// Which hotkey is being bound.
        target: HotkeyTarget 
    },
    /// App is capturing user mouse/keyboard input and saving it to an ActionSet.
    Recording,
    /// App is playing back a recorded or manual sequence.
    Playing,
}

/// The engine's thread-safe configuration and state storage.
#[derive(Debug, Clone)]
pub struct EngineState {
    state: AppState,
    record_toggle_vk: u32,
    start_sequence_vk: u32,
}

impl Default for EngineState {
    fn default() -> Self {
        // ASSUMPTION: Default hotkeys are F9 for Record and F10 for Play
        Self {
            state: AppState::Idle,
            record_toggle_vk: 0x78, // VK_F9
            start_sequence_vk: 0x79, // VK_F10
        }
    }
}

impl EngineState {
    /// Creates a new EngineState with custom default hotkeys.
    pub fn new(record_toggle_vk: u32, start_sequence_vk: u32) -> Self {
        Self {
            state: AppState::Idle,
            record_toggle_vk,
            start_sequence_vk,
        }
    }

    /// Returns the current AppState.
    pub fn state(&self) -> AppState {
        self.state
    }

    /// Transition to a new AppState.
    pub fn set_state(&mut self, new_state: AppState) {
        self.state = new_state;
    }

    /// Returns the virtual keycode configured for the Record Toggle hotkey.
    pub fn record_toggle_vk(&self) -> u32 {
        self.record_toggle_vk
    }

    /// Sets the virtual keycode for the Record Toggle hotkey.
    pub fn set_record_toggle_vk(&mut self, vk: u32) {
        self.record_toggle_vk = vk;
    }

    /// Returns the virtual keycode configured for the Start Sequence hotkey.
    pub fn start_sequence_vk(&self) -> u32 {
        self.start_sequence_vk
    }

    /// Sets the virtual keycode for the Start Sequence hotkey.
    pub fn set_start_sequence_vk(&mut self, vk: u32) {
        self.start_sequence_vk = vk;
    }
}
