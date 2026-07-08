import React, { useEffect, useRef } from "react";

interface Props {
  label: string;
  currentKey: string;
  isListening: boolean;
  onStartListening: () => void;
  onCancelListening: () => void;
  onKeyCapture?: (keyName: string) => void;
}

/**
 * HotkeyField displays a global hotkey configuration binding.
 * Toggles a pulsing indicator state while listening for the next hardware keypress.
 *
 * Uses a native browser `keydown` listener when listening, ensuring reliable
 * key capture regardless of whether the low-level Win32 hook is active.
 */
export const HotkeyField: React.FC<Props> = ({
  label,
  currentKey,
  isListening,
  onStartListening,
  onCancelListening,
  onKeyCapture,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // When we enter listening mode, attach a global keydown handler
  // so we capture the next key press reliably via the browser API.
  useEffect(() => {
    if (!isListening) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels listening
      if (e.key === "Escape") {
        onCancelListening();
        return;
      }

      // Convert browser key name to our standard format
      const keyName = browserKeyToDisplayName(e);
      if (keyName && onKeyCapture) {
        onKeyCapture(keyName);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isListening, onCancelListening, onKeyCapture]);

  const handleClick = () => {
    if (isListening) {
      onCancelListening();
    } else {
      onStartListening();
    }
  };

  return (
    <div className="input-container" style={{ minWidth: "160px" }}>
      <label className="input-label">{label}</label>
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-secondary ${isListening ? "listening-pulse" : ""}`}
        onClick={handleClick}
        style={{
          borderStyle: isListening ? "dashed" : "solid",
          fontWeight: "600",
          letterSpacing: "0.05em",
        }}
      >
        {isListening ? "Press any key..." : currentKey}
      </button>
    </div>
  );
};

/**
 * Converts a browser KeyboardEvent to a human-readable key name
 * matching the format expected by our keycodes.rs backend.
 */
function browserKeyToDisplayName(e: KeyboardEvent): string | null {
  const key = e.key;
  const code = e.code;

  // Function keys F1-F24
  if (/^F\d+$/.test(key)) return key;

  // Named keys
  const namedKeys: Record<string, string> = {
    " ": "Space",
    Backspace: "Backspace",
    Tab: "Tab",
    Enter: "Enter",
    Shift: "Shift",
    Control: "Control",
    Alt: "Alt",
    Pause: "Pause",
    CapsLock: "CapsLock",
    Escape: "Escape",
    PageUp: "PageUp",
    PageDown: "PageDown",
    End: "End",
    Home: "Home",
    ArrowLeft: "Left",
    ArrowUp: "Up",
    ArrowRight: "Right",
    ArrowDown: "Down",
    Insert: "Insert",
    Delete: "Delete",
    NumLock: "NumLock",
    ScrollLock: "ScrollLock",
  };

  if (namedKeys[key]) return namedKeys[key];

  // Single alphanumeric characters
  if (key.length === 1 && /[a-zA-Z0-9]/.test(key)) {
    return key.toUpperCase();
  }

  // Numpad keys from code
  if (code.startsWith("Numpad")) {
    const numPart = code.replace("Numpad", "");
    if (/^\d$/.test(numPart)) return `Num${numPart}`;
    const numpadNames: Record<string, string> = {
      Multiply: "NumMultiply",
      Add: "NumAdd",
      Subtract: "NumSubtract",
      Decimal: "NumDecimal",
      Divide: "NumDivide",
    };
    if (numpadNames[numPart]) return numpadNames[numPart];
  }

  // Modifier side variants
  if (code === "ShiftLeft") return "LShift";
  if (code === "ShiftRight") return "RShift";
  if (code === "ControlLeft") return "LControl";
  if (code === "ControlRight") return "RControl";
  if (code === "AltLeft") return "LAlt";
  if (code === "AltRight") return "RAlt";

  // Fallback: use the key as-is if it seems valid
  if (key.length <= 12 && key !== "Unidentified" && key !== "Dead") {
    return key;
  }

  return null;
}
