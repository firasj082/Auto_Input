import React, { useState, useEffect } from "react";
import type { Loadout, SequenceItem } from "../types/sequence";

interface Props {
  isOpen: boolean;
  loadout: Loadout | null;
  onClose: () => void;
  onLoad: (loadout: Loadout) => void;
  onSaveDetails: (loadout: Loadout) => void;
}

/** Formats milliseconds into a human-readable string. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function getActionLabel(item: SequenceItem): string {
  if (item.type === "manual") {
    const mode = item.actionMode === "doubleclick" ? "2×Click" : item.actionMode === "hold" ? "Hold" : "Click";
    return `${mode}: ${item.key}`;
  }
  return item.label || "Recorded ActionSet";
}

function getActionDetail(item: SequenceItem): string {
  if (item.type === "manual") {
    return `${item.intervalMs}ms interval`;
  }
  const dur = Math.round(item.originalDurationMs * item.playbackScale);
  return `${formatDuration(dur)} · ${item.events.length} events`;
}

/**
 * InspectLoadoutModal displays full details of a saved loadout,
 * allows editing its name/description, and provides a "Load into Timeline" action.
 */
export const InspectLoadoutModal: React.FC<Props> = ({
  isOpen,
  loadout,
  onClose,
  onLoad,
  onSaveDetails,
}) => {
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (isOpen && loadout) {
      setEditName(loadout.name);
      setEditDescription(loadout.description);
      setIsDirty(false);
    }
  }, [isOpen, loadout]);

  if (!isOpen || !loadout) return null;

  const items = loadout.sequence.items;
  const totalDuration = items.reduce((sum, item) => {
    if (item.type === "manual") return sum + item.intervalMs;
    return sum + Math.round(item.originalDurationMs * item.playbackScale);
  }, 0);

  const handleNameChange = (val: string) => {
    setEditName(val);
    setIsDirty(val !== loadout.name || editDescription !== loadout.description);
  };

  const handleDescChange = (val: string) => {
    setEditDescription(val);
    setIsDirty(editName !== loadout.name || val !== loadout.description);
  };

  const handleSaveDetails = () => {
    if (!editName.trim()) return;
    onSaveDetails({
      ...loadout,
      name: editName.trim(),
      description: editDescription.trim(),
    });
    setIsDirty(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "560px" }}>
        <h3 className="modal-header">Inspect Loadout</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Editable Name */}
          <div className="input-container">
            <label className="input-label">Name</label>
            <input
              type="text"
              className="input-field"
              value={editName}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={64}
            />
          </div>

          {/* Editable Description */}
          <div className="input-container">
            <label className="input-label">Description</label>
            <textarea
              className="input-field"
              value={editDescription}
              onChange={(e) => handleDescChange(e.target.value)}
              rows={2}
              maxLength={256}
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {/* Save Details button (only visible when dirty) */}
          {isDirty && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveDetails}
                disabled={!editName.trim()}
                style={{ fontSize: "12px", padding: "6px 14px" }}
              >
                Save Details
              </button>
            </div>
          )}

          {/* Stats Row */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 16px",
              display: "flex",
              gap: "24px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Actions</span>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-primary)" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Duration</span>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-primary)" }}>{formatDuration(totalDuration)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Repeat</span>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-primary)" }}>
                {loadout.sequence.repeat.mode === "infinite" ? "∞" : `${loadout.sequence.repeat.count}×`}
              </span>
            </div>
          </div>

          {/* Actions List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "4px" }}>
              Actions
            </span>
            <div
              style={{
                maxHeight: "220px",
                overflowY: "auto",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-panel)",
              }}
            >
              {items.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                  No actions in this loadout.
                </div>
              ) : (
                items.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderBottom: idx < items.length - 1 ? "1px solid var(--border-default)" : "none",
                      fontSize: "13px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          background: "var(--bg-elevated)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          fontWeight: "600",
                          color: "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>
                        {getActionLabel(item)}
                      </span>
                    </div>
                    <span style={{ color: "var(--text-secondary)", fontSize: "12px", flexShrink: 0 }}>
                      {getActionDetail(item)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onLoad(loadout)}
            >
              Load into Timeline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
