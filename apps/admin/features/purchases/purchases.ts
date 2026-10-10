import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { ensureStoreId } from "../../lib/storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * "partially_received" is not a real status - the real `purchases.status`
 * column only ever holds draft/ordered/received/cancelled (see
 * displayStatusLabel/displayStatusTone below, which is what the real
 * screens use). It's kept here only because PurchaseStatusPicker.tsx
 * (restored, currently unused by any real screen) still lists it as a
 * choice - this type exists so that file keeps compiling, not because the
 * backend can produce this value.
 */
export type PurchaseStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

export const PURCHASE_STATUS_TONE: Record<
  PurchaseStatus,
  "neutral" | "warning" | "success" | "danger"
> = {
  draft: "neutral",
  ordered: "warning",
  partially_received: "warning",
  received: "success",
  cancelled: "danger",
};

export interface PurchaseItem {
  id: string;
  variantId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  discount: number;
  tax: number;
  lineTotal: number;
  /** Summed from real inventory_batches - see receivePurchase on the backend. */
  received: number;
  pending: number;
  /** One per delivery that touched this line, oldest first - see deliveriesOf. */
  batches: { quantity: number; receivedAt: string }[];
  /**
   * Always "pcs" for now - the real schema has no per-line unit (purchase
   * quantities are plain integers in Phase 1). Kept only for ReturnSheet.tsx
   * (restored, currently unused), which displays it.
   */
  unit: string;
  /**
   * Always 0 - there is no real purchase_returns capability yet, so
   * nothing ever sets this. Kept only so ReturnSheet.tsx/returnableOf keep
   * compiling; a real return capability would replace this with an actual
   * sum, the same way `received` is summed from inventory_batches.
   */
  returned: number;
}

export interface Purchase {
  id: string;
  supplierId: string;
  reference: string | null;
  date: string;
  status: PurchaseStatus;
  /** Only meaningful once status is "received" - see PurchaseItemDto's own note. */
  fullyReceived: boolean | null;
  subtotal: number;
  discount: number;
  tax: number;
  adjustment: number;
  total: number;
  receivedAt: string | null;
  items: PurchaseItem[];
}

export interface PurchaseLineInput {
  variantId: string;
  quantity: number;
  unitCost: number;
  discount?: number;
  tax?: number;
}

export interface PurchaseInput {
  supplierId: string;
  reference: string;
  date: string;
  adjustment: number;
  items: PurchaseLineInput[];
}

export interface Delivery {
  date: string;
  items: { name: string; sku: string | null; quantity: number }[];
}

interface PurchaseItemResponse {
  id: string;
  variantId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitCost: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  receivedQuantity: number;
  pendingQuantity: number;
  batches: { quantity: number; receivedAt: string }[];
}

interface PurchaseResponse {
  id: string;
  supplierId: string;
  referenceNumber: string | null;
  purchaseDate: string;
  status: PurchaseStatus;
  fullyReceived: boolean | null;
  subtotalAmount: string;
  discountAmount: string;
  taxAmount: string;
  adjustmentAmount: string;
  totalAmount: string;
  receivedAt: string | null;
  items: PurchaseItemResponse[];
}

// formatDate/DatePicker elsewhere in this app expect plain YYYY-MM-DD, not
// a full ISO timestamp - truncated here, once, rather than at every call site.
const dateOnly = (iso: string) => iso.slice(0, 10);

function toPurchase(response: PurchaseResponse): Purchase {
  return {
    id: response.id,
    supplierId: response.supplierId,
    reference: response.referenceNumber,
    date: dateOnly(response.purchaseDate),
    status: response.status,
    fullyReceived: response.fullyReceived,
    subtotal: Number(response.subtotalAmount),
    discount: Number(response.discountAmount),
    tax: Number(response.taxAmount),
    adjustment: Number(response.adjustmentAmount),
    total: Number(response.totalAmount),
    receivedAt: response.receivedAt ? dateOnly(response.receivedAt) : null,
    items: response.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitCost: Number(item.unitCost),
      discount: Number(item.discountAmount),
      tax: Number(item.taxAmount),
      lineTotal: Number(item.lineTotal),
      received: item.receivedQuantity,
      pending: item.pendingQuantity,
      batches: item.batches.map((batch) => ({ ...batch, receivedAt: dateOnly(batch.receivedAt) })),
      unit: "pcs",
      returned: 0,
    })),
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** Lists this store's purchases from the real API - requires at least "purchases:view". */
export async function listPurchases(): Promise<Purchase[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/purchases?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as PurchaseResponse[];
  return data.map(toPurchase);
}

/** No GET /purchases/:id route - the list is what the admin screens actually fetch from. */
export async function getPurchase(id: string): Promise<Purchase | null> {
  const purchases = await listPurchases();
  return purchases.find((purchase) => purchase.id === id) ?? null;
}

/** Creates a draft - requires "purchases:edit". Returns the new purchase, or an error message. */
export async function createPurchase(input: PurchaseInput): Promise<Purchase | string> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      storeId,
      supplierId: input.supplierId,
      referenceNumber: input.reference,
      purchaseDate: input.date,
      adjustmentAmount: input.adjustment,
      items: input.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        discountAmount: item.discount ?? 0,
        taxAmount: item.tax ?? 0,
      })),
    }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return toPurchase((await response.json()) as PurchaseResponse);
}

/** Rewrites a draft wholesale - only while still draft. Returns the updated purchase, or an error message. */
export async function updatePurchase(id: string, input: PurchaseInput): Promise<Purchase | string> {
  const response = await fetch(`${API_URL}/purchases/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      supplierId: input.supplierId,
      referenceNumber: input.reference,
      purchaseDate: input.date,
      adjustmentAmount: input.adjustment,
      items: input.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        discountAmount: item.discount ?? 0,
        taxAmount: item.tax ?? 0,
      })),
    }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return toPurchase((await response.json()) as PurchaseResponse);
}

async function setStatus(id: string, status: "ordered" | "cancelled"): Promise<Purchase | string> {
  const response = await fetch(`${API_URL}/purchases/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return toPurchase((await response.json()) as PurchaseResponse);
}

/** draft -> ordered - requires "purchases:edit". */
export const placeOrder = (id: string) => setStatus(id, "ordered");
/** (draft|ordered) -> cancelled - requires "purchases:edit". */
export const cancelPurchase = (id: string) => setStatus(id, "cancelled");

/** Records one delivery - can be called more than once per purchase. Only the lines with something arriving need to be sent. */
export async function receiveDelivery(
  id: string,
  deliveryDate: string,
  lines: { purchaseItemId: string; quantity: number }[],
): Promise<Purchase | string> {
  const response = await fetch(`${API_URL}/purchases/${id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ deliveryDate, lines }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return toPurchase((await response.json()) as PurchaseResponse);
}

/** The same supplier invoice can't be entered twice, unless the earlier one was cancelled. */
export function referenceClash(
  purchases: Purchase[],
  supplierId: string,
  reference: string,
  ignoreId?: string,
): boolean {
  const wanted = reference.trim().toLowerCase();
  if (!wanted) return false;
  return purchases.some(
    (purchase) =>
      purchase.id !== ignoreId &&
      purchase.supplierId === supplierId &&
      purchase.status !== "cancelled" &&
      purchase.reference?.toLowerCase() === wanted,
  );
}

/** A purchase can take delivery once ordered, and until every line is complete. */
export function canReceive(purchase: Purchase): boolean {
  return purchase.status === "ordered" || (purchase.status === "received" && !purchase.fullyReceived);
}

/** Nothing has arrived yet, so the order can still be dropped (received is terminal). */
export function canCancel(purchase: Purchase): boolean {
  return purchase.status === "draft" || purchase.status === "ordered";
}

/** What the status badge actually shows - "received" alone doesn't distinguish partial from full. */
export function displayStatusLabel(purchase: Purchase): string {
  if (purchase.status === "received" && purchase.fullyReceived === false) {
    return "Partially received";
  }
  return PURCHASE_STATUS_LABEL[purchase.status];
}

export function displayStatusTone(purchase: Purchase): "neutral" | "warning" | "success" | "danger" {
  if (purchase.status === "received" && purchase.fullyReceived === false) return "warning";
  return PURCHASE_STATUS_TONE[purchase.status];
}

export function pendingUnits(purchase: Purchase): number {
  return purchase.items.reduce((sum, item) => sum + item.pending, 0);
}

export function orderedUnits(purchase: Purchase): number {
  return purchase.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function receivedUnits(purchase: Purchase): number {
  return purchase.items.reduce((sum, item) => sum + item.received, 0);
}

/**
 * Reconstructed, not stored: every delivery is really just "the batches
 * created on the same day" - there is no separate Delivery row on the
 * backend, see docs/db-design.md's receiving model.
 */
export function deliveriesOf(purchase: Purchase): Delivery[] {
  const byDate = new Map<string, Map<string, { name: string; sku: string | null; quantity: number }>>();
  for (const item of purchase.items) {
    for (const batch of item.batches) {
      const day = batch.receivedAt.slice(0, 10);
      const forDay = byDate.get(day) ?? new Map();
      const existing = forDay.get(item.id);
      forDay.set(item.id, {
        name: item.name,
        sku: item.sku,
        quantity: (existing?.quantity ?? 0) + batch.quantity,
      });
      byDate.set(day, forDay);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items: [...items.values()] }));
}

// ---------------------------------------------------------------------
// Purchase returns (sending goods back to a vendor). There is no
// purchase_returns capability on the backend yet - restored here only so
// ReturnSheet.tsx (components/ReturnSheet.tsx) keeps compiling while it
// waits for one. PurchaseItem.returned is always 0 (see its own note),
// so returnableOf is just "received" until that capability exists.
// ---------------------------------------------------------------------

export const RETURN_REASONS = [
  "Damaged",
  "Wrong item",
  "Quality issue",
  "Excess quantity",
  "Other",
] as const;

/**
 * How the money for returned goods is handled.
 * - refunded: the vendor paid it back
 * - pending: the vendor still owes the refund
 * - adjusted: taken off what is owed to the vendor instead
 */
export type RefundMode = "refunded" | "pending" | "adjusted";

export interface PurchaseReturn {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  reason: string;
  note?: string;
  items: { sku: string | null; name: string; unit: string; quantity: number; unitCredit: number }[];
  /** What the returned goods are worth: quantity times the cost actually paid per unit. */
  credit: number;
  refund: {
    mode: RefundMode;
    amount: number;
    method?: string;
    accountId?: string;
    /** When the money came back; only for a refund that has been received. */
    date?: string;
  };
}

/** What each unit actually cost: the line total (after its discount) over the quantity. */
export function unitCredit(item: PurchaseItem): number {
  return item.quantity > 0 ? Math.round((item.lineTotal / item.quantity) * 100) / 100 : 0;
}

/** Units that arrived and have not gone back. */
export function returnableOf(item: PurchaseItem): number {
  return Math.max(item.received - item.returned, 0);
}
