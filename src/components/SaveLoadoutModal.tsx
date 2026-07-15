import React, { useState, useEffect } from "react";
import type { SequenceItem, RepeatConfig } from "../types/sequence";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  items: SequenceItem[];
  repeat: RepeatConfig;
}

/** Formats milliseconds into a human-readable string like "1.5s" or "2m 30s". */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/** Calculates total duration across all sequence items. */
function getTotalDuration(items: SequenceItem[]): number {
  return items.reduce((sum, item) => {
    if (item.type === "manual") return sum + item.intervalMs;
    return sum + Math.round(item.originalDurationMs * item.playbackScale);
  }, 0);
}

/**
 * SaveLoadoutModal lets the user name and describe the current timeline
 * before saving it as a Loadout to the local AppData/Loadouts folder.
 */
export const SaveLoadoutModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  items,
  repeat,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalDuration = getTotalDuration(items);
  const manualCount = items.filter((i) => i.type === "manual").length;
  const recordedCount = items.filter((i) => i.type === "recorded").length;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, description.trim());
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "480px" }}>
        <h3 className="modal-header">Save Loadout</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Name Field */}
          <div className="input-container">
            <label className="input-label">Loadout Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Farm Run, PvP Macro..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={64}
            />
          </div>

          {/* Description Field */}
          <div className="input-container">
            <label className="input-label">Description (optional)</label>
            <textarea
              className="input-field"
              placeholder="What does this loadout do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={256}
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {/* Preview Stats */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              display: "flex",
              gap: "24px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Total Actions
              </span>
              <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-primary)" }}>
                {items.length}
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                {manualCount} manual · {recordedCount} recorded
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Duration
              </span>
              <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-primary)" }}>
                {formatDuration(totalDuration)}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Repeat
              </span>
              <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-primary)" }}>
                {repeat.mode === "infinite" ? "∞" : `${repeat.count}×`}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!name.trim()}
            >
              Save Loadout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
