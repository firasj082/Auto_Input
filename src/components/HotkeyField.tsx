import React from "react";

interface Props {
  label: string;
  currentKey: string;
  isListening: boolean;
  onStartListening: () => void;
  onCancelListening: () => void;
}

/**
 * HotkeyField displays a global hotkey configuration binding.
 * Toggles a pulsing indicator state while listening for the next hardware keypress.
 */
export const HotkeyField: React.FC<Props> = ({
  label,
  currentKey,
  isListening,
  onStartListening,
  onCancelListening,
}) => {
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
