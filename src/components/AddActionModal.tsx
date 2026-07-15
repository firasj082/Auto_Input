import React, { useState, useEffect, useRef } from "react";
import type { SequenceItem, ActionMode } from "../types/sequence";
import { PositiveIntegerInput } from "./PositiveIntegerInput";
import { MIN_INTERVAL_MS, MAX_INTERVAL_MS } from "../constants";
import { KEY_LIST } from "../constants/keyList";
import { useKeyCapture } from "../hooks/useKeyCapture";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: SequenceItem) => void;
}

// Canonical modifier alias maps
const ALIAS_MAP: Record<string, string> = {
  windows: "LWin",
  win: "LWin",
  rwindows: "RWin",
  rwin: "RWin",
  ctrl: "Control",
  control: "Control",
  lctrl: "LControl",
  rctrl: "RControl",
  alt: "Alt",
  lalt: "LAlt",
  ralt: "RAlt",
  shift: "Shift",
  lshift: "LShift",
  rshift: "RShift",
};

// Populate key list entries into alias mapping
KEY_LIST.forEach((k) => {
  ALIAS_MAP[k.name.toLowerCase()] = k.name;
});

const getCanonicalName = (token: string): string | null => {
  const t = token.trim();
  const tLower = t.toLowerCase();
  if (ALIAS_MAP[tLower]) {
    const canon = ALIAS_MAP[tLower];
    // Preserve user-typed casing for single alphanumeric characters
    if (canon.length === 1 && /[a-zA-Z]/.test(canon)) {
      return t;
    }
    return canon;
  }
  return null;
};

// Determine base modifier group to check overlaps (e.g. LControl + Control is redundant)
const getModifierGroup = (canonicalName: string): string | null => {
  const nameLower = canonicalName.toLowerCase();
  if (["control", "lcontrol", "rcontrol"].includes(nameLower)) return "control";
  if (["alt", "lalt", "ralt"].includes(nameLower)) return "alt";
  if (["shift", "lshift", "rshift"].includes(nameLower)) return "shift";
  if (["lwin", "rwin"].includes(nameLower)) return "win";
  return null;
};

export const AddActionModal: React.FC<Props> = ({ isOpen, onClose, onAdd }) => {
  const [keyName, setKeyName] = useState<string>("Space");
  const [intervalMs, setIntervalMs] = useState<number>(500);
  const [actionMode, setActionMode] = useState<ActionMode>("click");
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const captureButtonRef = useRef<HTMLButtonElement>(null);

  // Reset fields when the modal opens
  useEffect(() => {
    if (isOpen) {
      setKeyName("Space");
      setIntervalMs(500);
      setActionMode("click");
      setIsCapturing(false);
      setShowDropdown(false);
    }
  }, [isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Shared key capture hook (suspends global hotkeys)
  useKeyCapture((key) => {
    if (key === "Escape") {
      setIsCapturing(false);
    } else {
      // Overwrite field completely on key capture success
      setKeyName(key);
      setIsCapturing(false);
    }
  }, isCapturing);

  // Mouse capture listener
  useEffect(() => {
    if (!isCapturing) return;
    const handleMouseDown = (e: MouseEvent) => {
      // Bypass capture if clicking the capture toggle button to turn it off
      if (captureButtonRef.current?.contains(e.target as Node)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      let captured = "";
      if (e.button === 0) captured = "MouseLeft";
      else if (e.button === 2) captured = "MouseRight";
      else if (e.button === 1) captured = "MouseMiddle";

      if (captured) {
        // Overwrite field completely on mouse click capture success
        setKeyName(captured);
        setIsCapturing(false);
      }
    };
    window.addEventListener("mousedown", handleMouseDown, true);
    return () => window.removeEventListener("mousedown", handleMouseDown, true);
  }, [isCapturing]);

  if (!isOpen) return null;

  // Split input by "+" and validate each segment
  const rawTokens = keyName.split("+");
  const validatedTokens = rawTokens.map((raw, idx) => {
    const trimmed = raw.trim();
    const isLast = idx === rawTokens.length - 1;

    if (trimmed === "") {
      // Trailing empty token is incomplete but allowed while typing
      if (isLast && keyName.endsWith("+")) {
        return { text: raw, isValid: true, isIncomplete: true };
      }
      return { text: raw, isValid: false, reason: "Empty key name" };
    }

    const canonical = getCanonicalName(trimmed);
    if (!canonical) {
      return { text: trimmed, isValid: false, reason: `Unrecognized key: "${trimmed}"` };
    }

    return { text: trimmed, isValid: true, canonical };
  });

  // Check duplicate tokens and modifier overlaps
  let hasDuplicate = false;
  let hasOverlap = false;
  const seenCanonical = new Set<string>();
  const seenGroups = new Set<string>();

  validatedTokens.forEach((t) => {
    if (!t.isValid || t.isIncomplete) return;
    const canonical = t.canonical!;
    
    // Duplicate check
    if (seenCanonical.has(canonical.toLowerCase())) {
      hasDuplicate = true;
      t.isValid = false;
      t.reason = `Duplicate key: "${canonical}"`;
    }
    seenCanonical.add(canonical.toLowerCase());

    // Redundant modifier group overlap check
    const group = getModifierGroup(canonical);
    if (group) {
      if (seenGroups.has(group)) {
        hasOverlap = true;
        t.isValid = false;
        t.reason = `Redundant modifier: ${canonical} overlaps group`;
      }
      seenGroups.add(group);
    }
  });

  const isComboValid =
    keyName.trim() !== "" &&
    validatedTokens.every((t) => t.isValid && !t.isIncomplete) &&
    !hasDuplicate &&
    !hasOverlap;

  const handleConfirm = () => {
    if (!isComboValid) return;

    // Canonicalize the combo string on submission
    const canonicalStr = validatedTokens
      .filter((t) => t.isValid && !t.isIncomplete)
      .map((t) => t.canonical)
      .join(" + ");

    const newItem: SequenceItem = {
      type: "manual",
      id: crypto.randomUUID(),
      key: canonicalStr,
      intervalMs: intervalMs,
      actionMode: actionMode,
      enabled: true,
    };

    onAdd(newItem);
    onClose();
  };

  // Autocomplete query based on last typed token
  const lastPart = keyName.split("+").pop() || "";
  const lastToken = lastPart.trim().toLowerCase();

  const filteredKeys = KEY_LIST.filter((k) =>
    k.name.toLowerCase().includes(lastToken)
  );

  const selectSuggestion = (name: string) => {
    const parts = keyName.split("+");
    // Replace last element in-place
    parts[parts.length - 1] = " " + name;
    setKeyName(parts.join(" + ").trim());
    setShowDropdown(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "460px" }}>
        <h3 className="modal-header">Add Action</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Key Selection Controls */}
          <div className="input-container">
            <label className="input-label">Key / Button (e.g. LControl + D)</label>
            <div style={{ display: "flex", gap: "8px", position: "relative" }} ref={dropdownRef}>
              
              {/* Editable Text input with Autocomplete Suggestions */}
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="text"
                  className="input-field"
                  style={{ width: "100%", height: "38px" }}
                  placeholder="Type keys (e.g. LWin + D)..."
                  value={keyName}
                  onChange={(e) => {
                    setKeyName(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  disabled={isCapturing}
                />

                {showDropdown && (
                  <div
                    style={{
                      position: "absolute",
                      top: "42px",
                      left: 0,
                      right: 0,
                      maxHeight: "200px",
                      overflowY: "auto",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      zIndex: 1001,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {filteredKeys.length === 0 ? (
                      <span style={{ padding: "8px 12px", color: "var(--text-secondary)", fontSize: "13px" }}>
                        No keys found
                      </span>
                    ) : (
                      filteredKeys.map((k) => (
                        <button
                          key={k.name}
                          type="button"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 12px",
                            textAlign: "left",
                            color: "var(--text-primary)",
                            fontSize: "13px",
                            cursor: "pointer",
                            width: "100%",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => selectSuggestion(k.name)}
                        >
                          {k.name} <span style={{ float: "right", fontSize: "11px", color: "var(--text-secondary)" }}>{k.category}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Press Key Capture Button */}
              <button
                ref={captureButtonRef}
                type="button"
                className={`btn btn-secondary ${isCapturing ? "listening-pulse" : ""}`}
                style={{
                  width: "38px",
                  height: "38px",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderStyle: isCapturing ? "dashed" : "solid",
                  borderColor: isCapturing ? "var(--accent)" : "var(--border-default)",
                  flexShrink: 0
                }}
                onClick={() => setIsCapturing(!isCapturing)}
                title={isCapturing ? "Listening for keypress/click..." : "Record Keypress or Mouse Click"}
              >
                {isCapturing ? (
                  <span style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "var(--accent)",
                    animation: "fadeIn 0.8s infinite alternate"
                  }} />
                ) : (
                  "🎯"
                )}
              </button>

            </div>

            {/* Token Badges & Validation Warnings */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
              {validatedTokens.map((t, idx) => {
                if (t.text.trim() === "" && t.isIncomplete) return null;
                const isTokenValid = t.isValid;
                return (
                  <span
                    key={idx}
                    title={t.reason}
                    style={{
                      fontSize: "12px",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: isTokenValid ? "rgba(255,255,255,0.05)" : "rgba(239, 68, 68, 0.15)",
                      color: isTokenValid ? "var(--text-primary)" : "#ef4444",
                      borderBottom: isTokenValid ? "none" : "2px solid #ef4444",
                      fontWeight: "500",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {t.canonical || t.text}
                    {!isTokenValid && <span style={{ fontSize: "10px" }} title={t.reason}>⚠️</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Action Type Selector */}
          <div className="input-container">
            <label className="input-label">Action Type</label>
            <div style={{ display: "flex", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", padding: "2px" }}>
              {(["click", "hold", "doubleclick"] as ActionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    background: actionMode === mode ? "var(--bg-panel)" : "transparent",
                    color: actionMode === mode ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: actionMode === mode ? "600" : "500",
                    fontSize: "13px",
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "all var(--transition-fast)",
                  }}
                  onClick={() => setActionMode(mode)}
                >
                  {mode === "doubleclick" ? "Double Click" : mode}
                </button>
              ))}
            </div>
          </div>

          {/* Duration Input */}
          <PositiveIntegerInput
            label={actionMode === "hold" ? "Hold Duration" : "Click Delay / Interval"}
            value={intervalMs}
            onChange={setIntervalMs}
            min={MIN_INTERVAL_MS}
            max={MAX_INTERVAL_MS}
          />

          <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", fontStyle: "italic" }}>
            Note: Clicks will execute at the current cursor position.
          </span>
        </div>

        <div className="modal-footer" style={{ marginTop: "24px" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!isComboValid}
          >
            Add Action
          </button>
        </div>
      </div>
    </div>
  );
};
