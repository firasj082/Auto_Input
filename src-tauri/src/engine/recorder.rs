//! Macro recording pipeline.
//!
//! Accumulates incoming keyboard and mouse events during Recording mode,
//! and compiles them into a compacted, scale-ready ActionSet upon finalization.

use std::time::Instant;
use uuid::Uuid;

use crate::engine::constants::{MOUSE_MERGE_DISTANCE_PX, MOUSE_MERGE_MIN_GAP_MS};
use crate::engine::hook::RawInputEvent;
use crate::engine::schema::{PlaybackEvent, SequenceItem};
use crate::engine::keycodes::vk_to_string;

/// Internal representation of an event captured during recording.
#[derive(Debug, Clone)]
struct RecordedEvent {
    offset_ms: u32,
    event: RawInputEvent,
}

/// Accumulates system inputs and builds an ActionSet.
#[derive(Debug, Default)]
pub struct Recorder {
    start_time: Option<Instant>,
    events: Vec<RecordedEvent>,
}

impl Recorder {
    /// Resets the recorder and starts the recording timer.
    ///
    /// # Thread Safety
    /// Must be called from the controlling thread when transition to Recording begins.
    pub fn start(&mut self) {
        self.start_time = Some(Instant::now());
        self.events.clear();
    }

    /// Records a system-level input event with its relative time offset.
    ///
    /// # Thread Safety
    /// Safely handles inputs sequentially.
    pub fn record_event(&mut self, raw_event: RawInputEvent, event_time: Instant) {
        if let Some(start) = self.start_time {
            // Calculate millisecond offset since recording started
            let elapsed = event_time.saturating_duration_since(start).as_millis() as u32;
            self.events.push(RecordedEvent {
                offset_ms: elapsed,
                event: raw_event,
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

        // Compaction pass: merge mouse movements under distance or time thresholds
        let mut compacted_events: Vec<RecordedEvent> = Vec::with_capacity(self.events.len());
        let mut last_mouse_pos: Option<(i32, i32, u32)> = None;

        // We make a temporary buffer of events to scan
        let raw_events = std::mem::take(&mut self.events);

        for event in raw_events {
            match event.event {
                RawInputEvent::MouseMove { x, y } => {
                    if let Some((lx, ly, lt)) = last_mouse_pos {
                        let dx = (x - lx) as f32;
                        let dy = (y - ly) as f32;
                        let distance = (dx * dx + dy * dy).sqrt();
                        let time_delta = event.offset_ms.saturating_sub(lt);

                        // If mouse movement is below threshold and within the time limit, skip it
                        if distance < MOUSE_MERGE_DISTANCE_PX && (time_delta as u64) < MOUSE_MERGE_MIN_GAP_MS {
                            continue;
                        }
                    }
                    last_mouse_pos = Some((x, y, event.offset_ms));
                    compacted_events.push(event);
                }
                _ => {
                    // Reset mouse merge state whenever keyboard or click action takes place
                    last_mouse_pos = None;
                    compacted_events.push(event);
                }
            }
        }

        // Map internal events to the PlaybackEvent data shape
        let playback_events: Vec<PlaybackEvent> = compacted_events
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
                        play_evt.key = Some(vk_to_string(vk));
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

        // Generate dynamic label for the recorded set
        let label = format!("Action Set {}", Uuid::new_v4().to_string()[..4].to_uppercase());

        SequenceItem::Recorded {
            id: Uuid::new_v4().to_string(),
            label,
            original_duration_ms: total_duration,
            playback_scale: 1.0,
            events: playback_events,
        }
    }
}
