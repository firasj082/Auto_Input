import React, { useRef } from "react";
import { useKeyCapture } from "../hooks/useKeyCapture";

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

  // Consume shared key capture hook
  useKeyCapture((keyName) => {
    if (keyName === "Escape") {
      onCancelListening();
    } else if (onKeyCapture) {
      onKeyCapture(keyName);
    }
  }, isListening);

  const handleClick = () => {
    if (isListening) {
      onCancelListening();
    } else {
      onStartListening();
    }
  };

  return (
    <div className="hotkey-inline-container">
      <span className="input-label">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`hotkey-value-btn ${isListening ? "listening" : ""}`}
        onClick={handleClick}
      >
        <span>{isListening ? "Press any key..." : currentKey}</span>
        {!isListening && (
          <span className="edit-icon-inline">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          </span>
        )}
      </button>
    </div>
  );
};

/**
 * Converts a browser KeyboardEvent to a human-readable key name
 * matching the format expected by our keycodes.rs backend.
 */
export function browserKeyToDisplayName(e: KeyboardEvent): string | null {
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
    Meta: "LWin",
    ContextMenu: "Apps",
    PrintScreen: "PrintScreen",
    Sleep: "Sleep",
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
  if (code === "MetaLeft") return "LWin";
  if (code === "MetaRight") return "RWin";

  // Fallback: use the key as-is if it seems valid
  if (key.length <= 12 && key !== "Unidentified" && key !== "Dead") {
    return key;
  }

  return null;
}
