/**
 * Canonical data shape types for the macro sequence editor.
 *
 * Must match the Rust schema structs in src-tauri/src/engine/schema.rs field-for-field.
 * If a field is added or renamed in schema.rs, update this file in the same change.
 */

export type MouseButton = "left" | "right" | "middle";

export interface PlaybackEvent {
  /** Milliseconds offset since the start of this action set's recording. */
  t: number;
  /** Type of event: "keydown" | "keyup" | "mousemove" | "mousedown" | "mouseup" */
  kind: string;
  /** Associated key name for keyboard events. */
  key?: string;
  /** Mouse button for mouse events. */
  button?: MouseButton;
  /** Absolute horizontal screen coordinate. */
  x?: number;
  /** Absolute vertical screen coordinate. */
  y?: number;
}

export interface ManualItem {
  type: "manual";
  id: string;
  key: string;
  intervalMs: number;
}

export interface RecordedItem {
  type: "recorded";
  id: string;
  label: string;
  originalDurationMs: number;
  playbackScale: number;
  events: PlaybackEvent[];
}

export type SequenceItem = ManualItem | RecordedItem;

export interface RepeatConfig {
  mode: "count" | "infinite";
  count: number;
}

export interface HotkeysConfig {
  recordToggle: string;
  startSequence: string;
}

export interface MacroSequence {
  repeat: RepeatConfig;
  items: SequenceItem[];
}

export interface MacroProfile {
  version: number;
  appId: string;
  hotkeys: HotkeysConfig;
  sequence: MacroSequence;
}
