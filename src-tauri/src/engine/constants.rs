//! Global constants for the macro recording and playback engine.
//!
//! Encodes timing limits, mouse merging thresholds, and panic hotkey settings
//! to ensure consistency between engine modules.

pub const MIN_INTERVAL_MS: u32 = 100;
pub const MAX_INTERVAL_MS: u32 = 3_600_000; // 1 hour
pub const PANIC_HOLD_MS: u64 = 1_000; // 1 second hold for Escape
pub const MOUSE_MERGE_DISTANCE_PX: f32 = 3.0; // mouse merge distance threshold
pub const MOUSE_MERGE_MIN_GAP_MS: u64 = 15; // mouse merge timing threshold
pub const OVERLAY_TIMER_TICK_MS: u64 = 1_000; // mm:ss timer tick interval

// Win32 Hook Low-Level Injected Flags
// SAFETY: Named constants representing injected event flags in Win32 low-level hooks.
pub const LLKHF_INJECTED: u32 = 0x00000010;
pub const LLMHF_INJECTED: u32 = 0x00000001;
