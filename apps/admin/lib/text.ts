/** Trims and collapses repeated spaces, the same way the server saves names: "Tea    Coffee" becomes "Tea Coffee". */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Longest name each field takes; the server enforces the same limits (and the database columns match). */
export const NAME_MAX = 100;
export const ACCOUNT_NAME_MAX = 200;
export const NOTE_MAX = 500;
