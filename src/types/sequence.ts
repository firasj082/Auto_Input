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

export type ActionMode = "click" | "hold" | "doubleclick";

export interface ManualItem {
  type: "manual";
  id: string;
  key: string;
  intervalMs: number;
  actionMode: ActionMode;
  enabled?: boolean;
}

export interface RecordedItem {
  type: "recorded";
  id: string;
  label: string;
  originalDurationMs: number;
  playbackScale: number;
  events: PlaybackEvent[];
  enabled?: boolean;
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

export interface Loadout {
  id: string;
  name: string;
  description: string;
  sequence: MacroSequence;
  version: number;
  lastUsedAt: number;
  lastUpdatedAt: number;
}

export interface LoadoutMetadata {
  id: string;
  name: string;
  description: string;
  repeatMode: "count" | "infinite";
  repeatCount: number;
  totalItems: number;
  totalDurationMs: number;
  lastUsedAt: number;
  lastUpdatedAt: number;
}

export interface ThemeColors {
  bgApp: string;
  bgPanel: string;
  bgElevated: string;
  borderDefault: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentHover: string;
  statusRecording: string;
  statusPlaying: string;
  statusWarning: string;
}

export interface Theme {
  id: string;
  name: string;
  isBuiltIn: boolean;
  colors: ThemeColors;
}

export interface AppSettings {
  activeThemeId: string;
  recordDragMotion: boolean;
  whenClosed: string;
}
