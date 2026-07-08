import React from "react";

interface Props {
  isRecording: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * RecordButton toggles the global macro recording mode.
 * Shows a pulsing red indicator when recording is active.
 */
export const RecordButton: React.FC<Props> = ({
  isRecording,
  onToggle,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      className={`btn ${isRecording ? "btn-danger recording-pulse" : "btn-primary"}`}
      onClick={onToggle}
      disabled={disabled}
      style={{ minWidth: "140px" }}
    >
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: isRecording ? "#ffffff" : "#ef4444",
          display: "inline-block",
        }}
      />
      {isRecording ? "Stop Recording" : "Record Action"}
    </button>
  );
};
