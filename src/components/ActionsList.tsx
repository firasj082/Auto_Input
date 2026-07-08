import React, { useState } from "react";
import type { SequenceItem } from "../types/sequence";
import { ActionRow } from "./ActionRow";

interface Props {
  items: SequenceItem[];
  onUpdate: (id: string, updates: Partial<SequenceItem>) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
}

/**
 * ActionsList renders the ordered macro items timeline.
 * Manages native HTML5 drag-and-drop index state.
 */
export const ActionsList: React.FC<Props> = ({
  items,
  onUpdate,
  onDelete,
  onReorder,
  disabled = false,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (disabled || draggedIndex === null) return;
    e.preventDefault();
    if (draggedIndex !== targetIndex) {
      onReorder(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
  };

  if (items.length === 0) {
    return (
      <div
        className="actions-list-container"
        style={{
          justifyContent: "center",
          alignItems: "center",
          border: "2px dashed var(--border-color)",
          borderRadius: "var(--radius-lg)",
          color: "var(--text-muted)",
          fontSize: "14px",
          minHeight: "220px",
        }}
      >
        <span>No macro actions added yet.</span>
        <span style={{ fontSize: "11px", marginTop: "4px" }}>
          Record action or add manual clicks to start.
        </span>
      </div>
    );
  }

  return (
    <div className="actions-list-container">
      {items.map((item, index) => (
        <ActionRow
          key={item.id}
          item={item}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          index={index}
          disabled={disabled}
        />
      ))}
    </div>
  );
};
