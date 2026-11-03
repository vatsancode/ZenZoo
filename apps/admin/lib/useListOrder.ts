import { useDragReorder } from "./useDragReorder";
import { useSingleFlight } from "./useSingleFlight";

/**
 * The "put my list in my own order" behaviour shared by Payment methods and Units: move one
 * row (by dragging or the arrows), save the whole order, and reset to A-Z. The list is re-read
 * after every save, so it always shows what was really saved; if that fails, the previous
 * order is put back. One save runs at a time, and `ordering` is true while it does.
 */
export function useListOrder<T extends { id: string }>({
  enabled,
  items,
  setItems,
  reload,
  save,
  reset,
  notify,
}: {
  /** False for people who can't edit: nothing can be dragged. */
  enabled: boolean;
  items: T[];
  setItems: (items: T[]) => void;
  reload: () => Promise<void>;
  save: (items: T[]) => Promise<string | null>;
  reset: () => Promise<string | null>;
  notify: (message: string) => void;
}) {
  const { busy: ordering, run } = useSingleFlight();

  function move(id: string, toIndex: number) {
    const from = items.findIndex((item) => item.id === id);
    if (from < 0 || toIndex < 0 || toIndex >= items.length || from === toIndex) return;
    const previous = items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(toIndex, 0, moved!);
    return run(async () => {
      setItems(next);
      try {
        const problem = await save(next);
        if (problem) notify(problem);
      } finally {
        try {
          await reload();
        } catch {
          setItems(previous);
        }
      }
    });
  }

  function resetOrder() {
    return run(async () => {
      const problem = await reset();
      notify(problem ?? "Back to A to Z.");
      await reload();
    });
  }

  const drag = useDragReorder({
    disabled: !enabled || ordering,
    onMove: (id, toIndex) => void move(id, toIndex),
  });

  return { ordering, move, resetOrder, ...drag };
}
