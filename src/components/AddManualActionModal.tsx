import React, { useState, useEffect } from "react";
import type { SequenceItem } from "../types/sequence";
import { PositiveIntegerInput } from "./PositiveIntegerInput";
import { MIN_INTERVAL_MS, MAX_INTERVAL_MS } from "../constants";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: SequenceItem) => void;
}

/**
 * AddManualActionModal provides form layout to append a manual click key action.
 */
export const AddManualActionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [keyName, setKeyName] = useState<string>("Space");
  const [intervalMs, setIntervalMs] = useState<number>(500);

  // Reset fields when the modal opens
  useEffect(() => {
    if (isOpen) {
      setKeyName("Space");
      setIntervalMs(500);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const trimmedKey = keyName.trim();
    if (!trimmedKey) return;

    // Construct new manual action item
    // ASSUMPTION: Use crypto.randomUUID() for secure, unique string identifiers
    const newItem: SequenceItem = {
      type: "manual",
      id: crypto.randomUUID(),
      key: trimmedKey,
      intervalMs: intervalMs,
    };

    onAdd(newItem);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-header">Add Click Action</h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="input-container">
            <label className="input-label">Key Name (e.g. Space, F6, W)</label>
            <input
              type="text"
              className="input-field"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. Space"
              autoFocus
            />
          </div>

          <PositiveIntegerInput
            label="Duration / Click Interval"
            value={intervalMs}
            onChange={setIntervalMs}
            min={MIN_INTERVAL_MS}
            max={MAX_INTERVAL_MS}
          />
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!keyName.trim()}
          >
            Add Action
          </button>
        </div>
      </div>
    </div>
  );
};
