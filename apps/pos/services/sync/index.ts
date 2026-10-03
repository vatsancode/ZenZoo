/**
 * Interface only - no sync engine wired up yet (not PowerSync, not anything
 * else). This is where `local-db` changes would eventually get reconciled
 * with the backend once the POS needs to work fully offline (see README).
 * Nothing in the app imports from here yet.
 */
export interface SyncEngine {
  push(): Promise<void>;
  pull(): Promise<void>;
  readonly status: "idle" | "syncing" | "offline" | "error";
}
