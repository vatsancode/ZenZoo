import { useState, type DragEvent } from "react";

/**
 * Drag-and-drop for a list of rows. Spread `rowProps(id, index)` onto each row; `onMove` is called
 * with the dragged row's id and the index it was dropped on, and does the saving.
 * `dragId` and `overId` are for dimming the row being dragged and marking where it would land.
 */
export function useDragReorder({
  disabled,
  onMove,
}: {
  disabled: boolean;
  onMove: (id: string, toIndex: number) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function clear() {
    setDragId(null);
    setOverId(null);
  }

  function rowProps(id: string, index: number) {
    return {
      draggable: !disabled,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDragId(id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!dragId) return;
        event.preventDefault();
        setOverId(id);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (dragId) onMove(dragId, index);
        clear();
      },
      onDragEnd: clear,
    };
  }

  return { dragId, overId, rowProps };
}
