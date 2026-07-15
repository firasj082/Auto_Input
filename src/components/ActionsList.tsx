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
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (disabled || draggedIndex === null) return;
    
    // Safety check validating indices are still within bounds
    if (draggedIndex < 0 || draggedIndex >= items.length || targetIndex < 0 || targetIndex >= items.length) {
      setDraggedIndex(null);
      return;
    }

    if (draggedIndex !== targetIndex) {
      onReorder(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  if (items.length === 0) {
    return (
      <div className="actions-list-empty">
        <span>No macro actions added yet.</span>
        <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
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
          onDragEnd={handleDragEnd}
          index={index}
          disabled={disabled}
          isBeingDragged={draggedIndex === index}
        />
      ))}
    </div>
  );
};
