/**
 * Interface only - no SQLite wired up yet. This is the seam `services/api`
 * will eventually read/write through first, once the POS needs to work
 * fully offline (see README). Nothing in the app imports from here yet.
 */
export interface LocalDb {
  get<T>(table: string, id: string): Promise<T | null>;
  put<T>(table: string, id: string, value: T): Promise<void>;
  delete(table: string, id: string): Promise<void>;
}
