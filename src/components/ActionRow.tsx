import React from "react";
import type { SequenceItem } from "../types/sequence";

interface Props {
  item: SequenceItem;
  onUpdate: (id: string, updates: Partial<SequenceItem>) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd?: () => void;
  index: number;
  disabled?: boolean;
  isBeingDragged?: boolean;
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
  onDragEnd,
  index,
  disabled = false,
  isBeingDragged = false,
}) => {
  const isManual = item.type === "manual";
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [isEditingTime, setIsEditingTime] = React.useState(false);

  // Compute active duration of recorded item
  const currentDuration = !isManual
    ? Math.round(item.originalDurationMs * item.playbackScale)
    : 0;

  const initialTimeVal = isManual ? item.intervalMs : currentDuration;
  const [tempValue, setTempValue] = React.useState(initialTimeVal.toString());

  React.useEffect(() => {
    setTempValue(initialTimeVal.toString());
  }, [initialTimeVal]);

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

  const isEnabled = item.enabled !== false;

  return (
    <div
      className="action-row"
      onDragOver={onDragOver}
      onDragEnter={() => {
        if (!disabled && !isBeingDragged) setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        setIsDragOver(false);
        onDrop(e, index);
      }}
      style={{
        opacity: disabled ? 0.6 : isEnabled ? 1 : 0.5,
        borderTop: (isDragOver && !isBeingDragged) ? "2px solid var(--accent)" : undefined,
        transition: "opacity var(--transition-fast), border var(--transition-fast)",
      }}
    >
      {/* 1. Drag Handle — the only draggable element in the row */}
      <div
        className="drag-handle"
        draggable={!disabled}
        onDragStart={(e) => {
          if (disabled) { e.preventDefault(); return; }
          onDragStart(e, index);
        }}
        onDragEnd={() => {
          if (onDragEnd) onDragEnd();
        }}
        style={{ cursor: disabled ? "default" : "grab" }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        >
          <line x1="9" y1="4" x2="15" y2="4" />
          <line x1="9" y1="9" x2="15" y2="9" />
          <line x1="9" y1="14" x2="15" y2="14" />
          <line x1="9" y1="19" x2="15" y2="19" />
        </svg>
      </div>

      {/* 2. Type Icon */}
      <div className="row-type-icon" title={isManual ? "Manual Click Action" : "Recorded Action Set"}>
        {isManual ? (
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
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
            <line x1="6" y1="8" x2="6" y2="8" />
            <line x1="10" y1="8" x2="10" y2="8" />
            <line x1="14" y1="8" x2="14" y2="8" />
            <line x1="18" y1="8" x2="18" y2="8" />
            <line x1="6" y1="12" x2="6" y2="12" />
            <line x1="10" y1="12" x2="10" y2="12" />
            <line x1="14" y1="12" x2="14" y2="12" />
            <line x1="18" y1="12" x2="18" y2="12" />
            <line x1="7" y1="16" x2="17" y2="16" />
          </svg>
        ) : (
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
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="17" x2="22" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
          </svg>
        )}
      </div>

      {/* 3. Description (Editable Inline) */}
      <div className="row-info">
        <span className="row-title">
          {isManual ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Mouse icon for mouse keys, keyboard icon otherwise */}
              {item.key.toLowerCase().startsWith("mouse") ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="2" width="12" height="20" rx="6" />
                  <line x1="12" y1="2" x2="12" y2="10" />
                </svg>
              ) : (
                <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>⌨</span>
              )}
              <span
                style={{
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  fontWeight: "500",
                  padding: "0 2px",
                  userSelect: "text",
                }}
              >
                {item.key}
              </span>
              {/* Action Mode Badge */}
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  padding: "2px 6px",
                  marginLeft: "2px",
                  borderRadius: "4px",
                  background: item.actionMode === "click"
                    ? "rgba(99, 102, 241, 0.15)"
                    : item.actionMode === "hold"
                    ? "rgba(245, 158, 11, 0.15)"
                    : "rgba(16, 185, 129, 0.15)",
                  color: item.actionMode === "click"
                    ? "var(--accent)"
                    : item.actionMode === "hold"
                    ? "#f59e0b"
                    : "#10b981",
                }}
              >
                {item.actionMode === "doubleclick" ? "2×click" : item.actionMode}
              </span>
            </div>
          ) : (
            <span
              style={{
                color: "var(--text-primary)",
                fontSize: "14px",
                fontWeight: "500",
                padding: "0 2px",
                userSelect: "text",
              }}
            >
              {item.label}
            </span>
          )}
        </span>
        <span className="row-subtitle">
          {isManual
            ? item.actionMode === "hold"
              ? `Holds ${item.key} for ${item.intervalMs}ms`
              : item.actionMode === "doubleclick"
              ? `Double-clicks ${item.key}`
              : `Clicks ${item.key}`
            : `Recorded ActionSet (${item.events.length} events)`}
        </span>
      </div>

      {/* 4. Delay/Duration (Monospace Click-to-Edit) */}
      <div className="row-duration-container" style={{ display: "flex", alignItems: "center", minWidth: "120px", justifyContent: "flex-end" }}>
        {isEditingTime ? (
          <input
            type="text"
            value={tempValue}
            autoFocus
            onChange={(e) => {
              const rawVal = e.target.value;
              if (rawVal === "" || /^\d*$/.test(rawVal)) {
                setTempValue(rawVal);
              }
            }}
            onBlur={() => {
              setIsEditingTime(false);
              let val = parseInt(tempValue, 10);
              if (isNaN(val) || val < 1) {
                val = 1;
              }
              if (isManual) {
                handleIntervalChange(val);
              } else {
                handleDurationChange(val);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setTempValue(initialTimeVal.toString());
                setIsEditingTime(false);
              }
            }}
            style={{
              width: `${Math.max(50, tempValue.length * 8 + 16)}px`,
              padding: "4px 8px",
              fontSize: "13px",
              fontFamily: "monospace",
              background: "var(--bg-elevated)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              outline: "none",
              textAlign: "right",
            }}
          />
        ) : (
          <div
            onClick={() => !disabled && setIsEditingTime(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: disabled ? "default" : "pointer",
              padding: "4px 8px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontWeight: "500",
              fontFamily: "monospace",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              if (!disabled) e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              if (!disabled) e.currentTarget.style.borderColor = "var(--border-default)";
            }}
            title="Click to edit delay"
          >
            <span>{initialTimeVal}</span>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </div>
        )}
        <span className="row-duration-unit">ms</span>
        {!isManual && (
          <span style={{ fontSize: "10px", color: "var(--accent)", fontWeight: "500", marginLeft: "8px", whiteSpace: "nowrap" }}>
            {item.playbackScale.toFixed(2)}x
          </span>
        )}
      </div>

      {/* 5. Enabled Toggle Checkbox */}
      <div className="row-toggle" title={isEnabled ? "Disable Action" : "Enable Action"}>
        <input
          type="checkbox"
          checked={isEnabled}
          disabled={disabled}
          onChange={(e) => onUpdate(item.id, { enabled: e.target.checked })}
          className="row-toggle-checkbox"
        />
      </div>

      {/* 6. Delete Icon */}
      <button
        type="button"
        className="btn-destructive"
        onClick={() => onDelete(item.id)}
        disabled={disabled}
        style={{ padding: "8px" }}
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
