import { redirectToSignInIfUnauthorized } from "./auth";
import { ensureStoreId } from "./storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface RealBatch {
  id: string;
  barcode: string;
  receivedQuantity: number;
  availableQuantity: number;
  unitCost: string;
  receivedAt: string;
}

export interface RealStockMovement {
  id: string;
  movementType: string;
  quantity: number;
  batchId: string;
  referenceType: string | null;
  occurredAt: string;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error("Couldn't load stock data.");
  }
  return (await response.json()) as T;
}

/** On-hand quantity per variant for this store - SUM(available_quantity), the real number, never a cache of it. */
export async function listCurrentStock(): Promise<Record<string, number>> {
  const storeId = await ensureStoreId();
  const rows = await get<{ variantId: string; onHand: number }[]>(`/stock/current?storeId=${storeId}`);
  return Object.fromEntries(rows.map((row) => [row.variantId, row.onHand]));
}

/** Batches still holding stock for one variant, oldest first. */
export async function listInventoryBatches(variantId: string): Promise<RealBatch[]> {
  return get<RealBatch[]>(`/variants/${variantId}/batches`);
}

/** The real stock_movements ledger for one variant, newest first. Append-only - nothing here can be edited or undone. */
export async function listStockMovements(variantId: string): Promise<RealStockMovement[]> {
  return get<RealStockMovement[]>(`/variants/${variantId}/movements`);
}
