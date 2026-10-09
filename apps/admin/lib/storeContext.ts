import { redirectToSignInIfUnauthorized } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const STORAGE_KEY = "zenzoo.currentStoreId";

export interface Store {
  id: string;
  name: string;
  code: string;
}

/**
 * The first feature (categories) to need "which store am I looking at" -
 * nothing in the admin app resolved that before. Kept deliberately small:
 * one module-level cache of the tenant's stores, plus the chosen store id
 * persisted in localStorage so it survives a reload. Every store-scoped
 * feature should go through ensureStoreId() rather than inventing its own
 * notion of "current store".
 */
let storesCache: Store[] | null = null;

export async function listMyStores(): Promise<Store[]> {
  if (storesCache) return storesCache;
  const response = await fetch(`${API_URL}/stores`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error("Couldn't load stores.");
  }
  const data = (await response.json()) as { stores: Store[] };
  storesCache = data.stores;
  return storesCache;
}

export function getCurrentStoreId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setCurrentStoreId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // best-effort - a feature that needs the id again just re-resolves it
  }
}

/**
 * Resolves the store a store-scoped call should act on: whatever is
 * already chosen, or - the common Phase 1 case - the tenant's only store,
 * picked automatically and remembered for next time.
 */
export async function ensureStoreId(): Promise<string> {
  const chosen = getCurrentStoreId();
  const stores = await listMyStores();
  if (chosen && stores.some((store) => store.id === chosen)) return chosen;

  if (stores.length === 0) throw new Error("You don't have access to any store yet.");
  setCurrentStoreId(stores[0].id);
  return stores[0].id;
}
