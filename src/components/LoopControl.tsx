import React, { useState, useEffect } from "react";
import type { RepeatConfig } from "../types/sequence";
import { PositiveIntegerInput } from "./PositiveIntegerInput";

interface Props {
  repeat: RepeatConfig;
  onChange: (config: RepeatConfig) => void;
  disabled?: boolean;
}

/**
 * LoopControl configures sequence loop repetitions.
 * Toggles disabled styling and displays "∞" when infinite is checked.
 */
export const LoopControl: React.FC<Props> = ({
  repeat,
  onChange,
  disabled = false,
}) => {
  const [lastCount, setLastCount] = useState<number>(repeat.count || 1);

  // Sync count history when count updates from props
  useEffect(() => {
    if (repeat.mode === "count" && repeat.count > 0) {
      setLastCount(repeat.count);
    }
  }, [repeat.count, repeat.mode]);

  const handleInfiniteToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    onChange({
      mode: checked ? "infinite" : "count",
      count: checked ? 0 : lastCount,
    });
  };

  const handleCountChange = (val: number) => {
    onChange({
      mode: "count",
      count: val,
    });
  };

  const isInfinite = repeat.mode === "infinite";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "24px",
        background: "rgba(255,255,255,0.01)",
        padding: "12px 20px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-color)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span className="input-label" style={{ fontSize: "13px" }}>
          Repeat Count
        </span>
        {isInfinite ? (
          <div
            className="input-field"
            style={{
              width: "80px",
              textAlign: "center",
              fontSize: "18px",
              fontWeight: "bold",
              color: "var(--accent-purple)",
              opacity: 0.5,
              background: "rgba(0, 0, 0, 0.25)",
              padding: "6px 10px",
              borderRadius: "var(--radius-md)",
            }}
          >
            ∞
          </div>
        ) : (
          <PositiveIntegerInput
            value={repeat.count}
            onChange={handleCountChange}
            disabled={disabled}
            style={{ width: "80px" }}
          />
        )}
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: "14px",
          fontWeight: "500",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={isInfinite}
          onChange={handleInfiniteToggle}
          disabled={disabled}
          style={{
            width: "16px",
            height: "16px",
            accentColor: "var(--accent-purple)",
            cursor: "inherit",
          }}
        />
        Repeat Forever
      </label>
    </div>
  );
};
