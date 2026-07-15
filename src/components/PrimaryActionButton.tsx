import React from "react";

interface Props {
  isRecording: boolean;
  isPlaying: boolean;
  isPlayDisabled: boolean;
  isRecordDisabled: boolean;
  onRecordToggle: () => void;
  onPlayToggle: () => void;
  repeatMode?: "count" | "infinite";
  repeatCount?: number;
}

export const PrimaryActionButton: React.FC<Props> = ({
  isRecording,
  isPlaying,
  isPlayDisabled,
  isRecordDisabled,
  onRecordToggle,
  onPlayToggle,
  repeatMode = "count",
  repeatCount = 1,
}) => {
  if (isRecording) {
    return (
      <div className="primary-action-container">
        <button
          type="button"
          className="primary-action-btn recording"
          onClick={onRecordToggle}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#ffffff",
              display: "inline-block",
            }}
          />
          Stop Recording
        </button>
      </div>
    );
  }

  if (isPlaying) {
    const isLooping = repeatMode === "infinite" || repeatCount > 1;
    return (
      <div className="primary-action-container">
        <button
          type="button"
          className="primary-action-btn playing"
          onClick={onPlayToggle}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          Stop {isLooping ? (repeatMode === "infinite" ? "(∞)" : `(${repeatCount}x)`) : ""}
        </button>
      </div>
    );
  }

  // Idle state
  return (
    <div className="primary-action-container">
      <button
        type="button"
        className="primary-action-btn idle"
        onClick={onRecordToggle}
        disabled={isRecordDisabled}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#ffffff",
            display: "inline-block",
          }}
        />
        Record
      </button>
      <button
        type="button"
        className="play-btn-inline"
        onClick={onPlayToggle}
        disabled={isPlayDisabled}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21" />
        </svg>
        Play
      </button>
    </div>
  );
};
