import React from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

/**
 * ConflictWarningModal warns the user about keybinding overlaps.
 */
export const ConflictWarningModal: React.FC<Props> = ({
  isOpen,
  onClose,
  message,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ borderColor: "var(--status-warning)" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--status-warning)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h3 className="modal-header" style={{ color: "var(--status-warning)" }}>
            Hotkey Conflict
          </h3>
        </div>

        <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
          {message}
        </p>

        <div className="modal-footer" style={{ marginTop: "10px" }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};
