import React from "react";
import type { SequenceItem } from "../types/sequence";
import { PositiveIntegerInput } from "./PositiveIntegerInput";
import { MIN_INTERVAL_MS, MAX_INTERVAL_MS } from "../constants";

interface Props {
  item: SequenceItem;
  onUpdate: (id: string, updates: Partial<SequenceItem>) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  index: number;
  disabled?: boolean;
}

/**
 * ActionRow renders a single item in the macro builder timeline.
 * Handles drag handles, deletion, and interval/speed updates.
 */
export const ActionRow: React.FC<Props> = ({
  item,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  index,
  disabled = false,
}) => {
  const isManual = item.type === "manual";

  const handleIntervalChange = (val: number) => {
    if (isManual) {
      onUpdate(item.id, { intervalMs: val });
    }
  };

  const handleDurationChange = (val: number) => {
    if (!isManual) {
      // Recalculate playbackScale = newDurationMs / originalDurationMs
      const original = item.originalDurationMs || 1;
      const newScale = val / original;
      onUpdate(item.id, { playbackScale: newScale });
    }
  };

  // Compute active duration of recorded item
  const currentDuration = !isManual
    ? Math.round(item.originalDurationMs * item.playbackScale)
    : 0;

  return (
    <div
      className="action-row"
      draggable={!disabled}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
      style={{ opacity: disabled ? 0.7 : 1 }}
    >
      <div className="drag-handle">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="9" y1="4" x2="15" y2="4" />
          <line x1="9" y1="9" x2="15" y2="9" />
          <line x1="9" y1="14" x2="15" y2="14" />
          <line x1="9" y1="19" x2="15" y2="19" />
        </svg>
      </div>

      <div className="row-info">
        <span className="row-title">
          {isManual ? `Click: ${item.key}` : item.label}
        </span>
        <span className="row-subtitle">
          {isManual
            ? "Simulates keypress down and up"
            : `Recorded ActionSet (${item.events.length} events)`}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
        {isManual ? (
          <PositiveIntegerInput
            value={item.intervalMs}
            onChange={handleIntervalChange}
            min={MIN_INTERVAL_MS}
            max={MAX_INTERVAL_MS}
            disabled={disabled}
          />
        ) : (
          <PositiveIntegerInput
            value={currentDuration}
            onChange={handleDurationChange}
            min={MIN_INTERVAL_MS}
            max={MAX_INTERVAL_MS}
            disabled={disabled}
          />
        )}
        <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "8px" }}>
          ms
        </span>
      </div>

      <div style={{ textAlign: "right" }}>
        {!isManual && (
          <span style={{ fontSize: "12px", color: "var(--accent-purple)", fontWeight: "500" }}>
            {item.playbackScale.toFixed(2)}x
          </span>
        )}
      </div>

      <button
        type="button"
        className="btn btn-text btn-danger"
        onClick={() => onDelete(item.id)}
        disabled={disabled}
        style={{ padding: "8px", borderRadius: "var(--radius-sm)" }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
};
