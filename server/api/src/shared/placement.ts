import { compareNames } from "./names";

/**
 * The order a shop's own lists (payment methods, units) are shown in: the rows it placed by
 * hand come first, in the order it chose; the rest follow A-Z (English, then Tamil, then the
 * rest). A new row has no place yet, so it lands at the end of a hand-made order instead of
 * jumping into the middle of it.
 */
export function sortByPlacement<T extends { id: string; name: string; sort_order: number | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== null && b.sort_order !== null) {
      return a.sort_order - b.sort_order || (a.id < b.id ? -1 : 1);
    }
    if (a.sort_order !== null) return -1;
    if (b.sort_order !== null) return 1;
    return compareNames(a.name, b.name) || (a.id < b.id ? -1 : 1);
  });
}

/**
 * True when `orderedIds` is exactly the shop's current ids, each once. Saving a partial list (a
 * row was added or removed in another tab) would leave two rows with the same place.
 */
export function isWholeList(orderedIds: unknown, existingIds: string[]): orderedIds is string[] {
  return (
    Array.isArray(orderedIds) &&
    orderedIds.length === existingIds.length &&
    new Set(orderedIds).size === orderedIds.length &&
    existingIds.every((id) => orderedIds.includes(id))
  );
}
