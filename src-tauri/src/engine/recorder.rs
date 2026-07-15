//! Macro recording pipeline.
//!
//! Accumulates incoming keyboard and mouse events during Recording mode,
//! and compiles them into a compacted, scale-ready ActionSet upon finalization.

use std::time::Instant;
use uuid::Uuid;

use crate::engine::hook::RawInputEvent;
use crate::engine::schema::{PlaybackEvent, SequenceItem};
use crate::engine::keycodes::vk_to_string_with_case;

/// Internal representation of an event captured during recording.
#[derive(Debug, Clone)]
struct RecordedEvent {
    offset_ms: u32,
    event: RawInputEvent,
    is_uppercase: bool,
}

/// Accumulates system inputs and builds an ActionSet.
#[derive(Debug, Default)]
pub struct Recorder {
    start_time: Option<Instant>,
    events: Vec<RecordedEvent>,
    pressed_keys: std::collections::HashSet<u32>,
    /// VK codes that must never be captured, even while the hook is active —
    /// e.g. the global hotkey bound to start/stop recording. Without this,
    /// pressing that hotkey to *stop* recording gets its own keydown/keyup
    /// swept into the sequence (there's no matching partner, since recording
    /// ends mid-press), and replaying that synthetic key during playback can
    /// re-trigger the same global hotkey.
    ignored_keys: std::collections::HashSet<u32>,
}

impl Recorder {
    /// Sets which VK codes should be silently dropped instead of recorded.
    /// Call this with your current control-hotkey VK(s) (record toggle,
    /// panic/stop, etc.) whenever they're configured or changed — it's
    /// independent of `start()`/`stop()` so existing call sites don't break.
    pub fn set_ignored_keys(&mut self, keys: std::collections::HashSet<u32>) {
        self.ignored_keys = keys;
    }

    /// Resets the recorder and starts the recording timer.
    ///
    /// # Thread Safety
    /// Must be called from the controlling thread when transition to Recording begins.
    pub fn start(&mut self) {
        self.start_time = Some(Instant::now());
        self.events.clear();
        self.pressed_keys.clear();
        // ignored_keys is intentionally left as-is here; set it separately
        // via set_ignored_keys() so callers don't need to pass it every time.
    }

    /// Records a system-level input event with its relative time offset.
    ///
    /// # Thread Safety
    /// Safely handles inputs sequentially.
    pub fn record_event(&mut self, raw_event: RawInputEvent, event_time: Instant) {
        if let Some(start) = self.start_time {
            let mut is_uppercase = false;
            if let RawInputEvent::Keyboard { vk, down } = raw_event {
                // Never record the app's own control hotkeys — pressing them
                // is a command to the app, not part of the macro being recorded.
                if self.ignored_keys.contains(&vk) {
                    return;
                }

                // Filter out keyboard auto-repeat events
                if down {
                    if self.pressed_keys.contains(&vk) {
                        return; // Ignore repeated auto-repeat event
                    }
                    self.pressed_keys.insert(vk);
                } else {
                    self.pressed_keys.remove(&vk);
                }

                // Determine case using Shift status and Caps Lock status at keypress time
                let shift = self.pressed_keys.contains(&0x10) || self.pressed_keys.contains(&0xA0) || self.pressed_keys.contains(&0xA1);
                let caps_lock = unsafe { windows::Win32::UI::Input::KeyboardAndMouse::GetKeyState(0x14) } & 1 != 0;
                is_uppercase = shift ^ caps_lock;
            }

            // Calculate millisecond offset since recording started
            let elapsed = event_time.saturating_duration_since(start).as_millis() as u32;
            self.events.push(RecordedEvent {
                offset_ms: elapsed,
                event: raw_event,
                is_uppercase,
            });
        }
    }

    /// Stops the recording, applies a compaction pass on mouse movement points,
    /// and constructs a new SequenceItem::Recorded structure.
    ///
    /// # Thread Safety
    /// Returns the compiled sequence item. Safe to call on the main handler.
    pub fn stop(&mut self) -> SequenceItem {
        let total_duration = self.start_time
            .map(|start| start.elapsed().as_millis() as u32)
            .unwrap_or(0);

        self.start_time = None;

        let raw_events = std::mem::take(&mut self.events);

        let playback_events: Vec<PlaybackEvent> = raw_events
            .into_iter()
            .map(|evt| {
                let mut play_evt = PlaybackEvent {
                    t: evt.offset_ms,
                    kind: "".to_string(),
                    key: None,
                    button: None,
                    x: None,
                    y: None,
                };

                match evt.event {
                    RawInputEvent::Keyboard { vk, down } => {
                        play_evt.kind = if down { "keydown".to_string() } else { "keyup".to_string() };
                        play_evt.key = Some(vk_to_string_with_case(vk, evt.is_uppercase));
                    }
                    RawInputEvent::MouseMove { x, y } => {
                        play_evt.kind = "mousemove".to_string();
                        play_evt.x = Some(x);
                        play_evt.y = Some(y);
                    }
                    RawInputEvent::MouseDown { button, x, y } => {
                        play_evt.kind = "mousedown".to_string();
                        play_evt.button = Some(button);
                        play_evt.x = Some(x);
                        play_evt.y = Some(y);
                    }
                    RawInputEvent::MouseUp { button, x, y } => {
                        play_evt.kind = "mouseup".to_string();
                        play_evt.button = Some(button);
                        play_evt.x = Some(x);
                        play_evt.y = Some(y);
                    }
                    _ => {}
                }
                play_evt
            })
            .collect();

        let label = format!("Action Set {}", Uuid::new_v4().to_string()[..4].to_uppercase());

        SequenceItem::Recorded {
            id: Uuid::new_v4().to_string(),
            label,
            original_duration_ms: total_duration,
            playback_scale: 1.0,
            events: playback_events,
            enabled: true,
        }
    }
}