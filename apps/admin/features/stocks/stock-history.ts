import type { Unit } from "./stocks";

// Sample purchase and consumption history. There's no stock-movement
// capability on the backend yet, so these are generated from the item's SKU:
// the same item always gets the same rows, and nothing is stored.

export interface StockItem {
  sku: string;
  unit: Unit;
  quantity: number;
  /**
   * The quantity before any movements recorded in this session. The sample
   * purchase and batch history is generated from it, so it doesn't reshuffle
   * every time a movement is recorded.
   */
  baseQuantity?: number;
  price: number;
  purchasePrice: number;
}

export interface Purchase {
  id: string;
  date: string;
  reference: string;
  vendor: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface Batch {
  id: string;
  /** Short lot code, taken from when the batch was received. */
  batchNo: string;
  barcode: string;
  receivedOn: string;
  /** How many came in with this batch. */
  received: number;
  /** How many of them are still on the shelf. */
  remaining: number;
  unitCost: number;
}

export type MovementType = "Sale" | "Return" | "Removed" | "Added" | "Counted";

/** A movement the user recorded against one batch. */
export interface RecordedMovement extends Movement {
  sku: string;
  batchId: string;
  batchNo: string;
  /** Set once an undo has been recorded for it. */
  reversed?: boolean;
  /** This row is itself the undo of an earlier one. */
  isReversal?: boolean;
  /** Set when this movement started a brand-new batch. */
  newBatch?: { barcode: string; receivedOn: string; unitCost: number };
}

/** Stands in for "a batch that doesn't exist yet" in the record-movement form. */
export const NEW_BATCH_ID = "__new_batch__";

export interface Movement {
  id: string;
  date: string;
  type: MovementType;
  reference: string;
  /** Negative when stock goes down, positive when it comes back. */
  quantity: number;
  /** Selling value of sales and returns; null for the rest. */
  amount: number | null;
}

const VENDORS = [
  "Sri Lakshmi Silks",
  "Madurai Handlooms",
  "Surat Textiles",
  "Jaipur Prints",
  "Chennai Fabric House",
];

// A fixed "today" keeps the sample dates stable between visits.
const TODAY = new Date("2026-10-04T00:00:00");

function seededRandom(seed: string): () => number {
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgo(days: number): string {
  const date = new Date(TODAY);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function purchaseHistory(item: StockItem): Purchase[] {
  const random = seededRandom(`purchase-${item.sku}`);
  const base = item.baseQuantity ?? item.quantity;
  const count = 4 + Math.floor(random() * 3);
  let age = 6 + Math.floor(random() * 8);
  const rows: Purchase[] = [];
  for (let index = 0; index < count; index++) {
    const quantity = Math.max(4, Math.round(base * (0.5 + random()) + 6));
    // Older purchases were slightly cheaper.
    const unitCost = Math.round(item.purchasePrice * (1 - index * 0.015));
    rows.push({
      id: `${item.sku}-purchase-${index}`,
      date: daysAgo(age),
      reference: `PO-${2400 + Math.floor(random() * 500)}`,
      vendor: VENDORS[Math.floor(random() * VENDORS.length)] ?? "",
      quantity,
      unitCost,
      total: quantity * unitCost,
    });
    age += 18 + Math.floor(random() * 22);
  }
  return rows;
}

// A valid EAN-13 (India prefix 890) built from a number, so the barcode looks real.
function ean13(seed: number): string {
  const body = `890${String(seed % 1_000_000_000).padStart(9, "0")}`;
  const sum = [...body].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
    0,
  );
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** A barcode for a batch made by hand; `salt` keeps two of them from matching. */
export function makeBatchBarcode(sku: string, salt: number): string {
  let seed = salt >>> 0;
  for (const char of sku) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  return ean13(seed);
}

/** The next free lot code for a day: B261004, then B261004-2, B261004-3... */
export function nextBatchNo(existing: Batch[], isoDate: string): string {
  const base = `B${isoDate.replaceAll("-", "").slice(2)}`;
  const taken = new Set(existing.map((batch) => batch.batchNo));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * The batches still holding stock. Oldest stock sells first, so what's on the
 * shelf now sits in the most recent batches.
 */
export function currentBatches(item: StockItem, includeEmpty = false): Batch[] {
  let left = item.baseQuantity ?? item.quantity;
  const batches: Batch[] = [];
  for (const [index, purchase] of purchaseHistory(item).entries()) {
    if (left <= 0 && !includeEmpty) break;
    const remaining = Math.min(purchase.quantity, left);
    left -= remaining;
    let seed = index + 1;
    for (const char of `${item.sku}${purchase.date}`) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    batches.push({
      id: `${item.sku}-batch-${index}`,
      batchNo: `B${purchase.date.replaceAll("-", "").slice(2)}`,
      barcode: ean13(seed),
      receivedOn: purchase.date,
      received: purchase.quantity,
      remaining,
      unitCost: purchase.unitCost,
    });
  }
  return batches;
}

export function consumptionHistory(item: StockItem): Movement[] {
  const random = seededRandom(`consumption-${item.sku}`);
  const whole = item.unit === "pcs";
  const rows: Movement[] = [];
  let age = Math.floor(random() * 2);
  for (let index = 0; index < 10; index++) {
    const roll = random();
    const type: MovementType =
      roll < 0.7
        ? "Sale"
        : roll < 0.8
          ? "Return"
          : roll < 0.92
            ? "Removed"
            : roll < 0.97
              ? "Added"
              : "Counted";
    const size = whole ? 1 + Math.floor(random() * 3) : Math.round((0.5 + random() * 2) * 2) / 2;
    const quantity = type === "Return" || type === "Added" ? size : -size;
    rows.push({
      id: `${item.sku}-movement-${index}`,
      date: daysAgo(age),
      type,
      reference:
        type === "Sale" || type === "Return"
          ? `BILL-${3000 + Math.floor(random() * 900)}`
          : type === "Removed"
            ? "Damaged in storage"
            : type === "Added"
              ? "Found in the back room"
              : "Stock count: shelf recount",
      quantity,
      amount: type === "Sale" || type === "Return" ? Math.abs(quantity) * item.price : null,
    });
    age += 1 + Math.floor(random() * 4);
  }
  return rows;
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// In-memory log of movements recorded this session, standing in for the
// database. Keyed by SKU, newest first.
const movementLog = new Map<string, RecordedMovement[]>();

export function getMovements(sku: string): RecordedMovement[] {
  return movementLog.get(sku) ?? [];
}

export function logMovement(movement: RecordedMovement): void {
  movementLog.set(movement.sku, [movement, ...getMovements(movement.sku)]);
}

/**
 * Applies recorded movements to the sample batches: each one moves its own
 * batch up or down, and any that started a new batch add that batch (newest first).
 */
export function withMovements(batches: Batch[], recorded: RecordedMovement[]): Batch[] {
  const change = (batchId: string) =>
    recorded
      .filter((movement) => movement.batchId === batchId)
      .reduce((sum, movement) => sum + movement.quantity, 0);

  const existing = batches.map((batch) => {
    const remaining = batch.remaining + change(batch.id);
    return { ...batch, remaining, received: Math.max(batch.received, remaining) };
  });

  // The log is newest first, so new batches come out newest first too.
  const created = recorded
    .filter((movement) => movement.newBatch)
    .map<Batch>((movement) => ({
      id: movement.batchId,
      batchNo: movement.batchNo,
      barcode: movement.newBatch?.barcode ?? "",
      receivedOn: movement.newBatch?.receivedOn ?? movement.date,
      received: movement.quantity,
      remaining: change(movement.batchId),
      unitCost: movement.newBatch?.unitCost ?? 0,
    }));

  return [...created, ...existing];
}

export type MovementAction = "remove" | "add" | "count";

/** What a person can do to a batch by hand. Plain words first; the reason comes next. */
export const MOVEMENT_ACTIONS: {
  id: MovementAction;
  title: string;
  hint: string;
  /** How a movement made with this action is grouped in the movements list. */
  type: MovementType;
}[] = [
  { id: "remove", title: "Remove stock", hint: "Some left without a sale", type: "Removed" },
  {
    id: "add",
    title: "Add stock",
    hint: "Some turned up that we don't know about",
    type: "Added",
  },
  { id: "count", title: "Fix the count", hint: "I counted the shelf", type: "Counted" },
];

/** Marks a recorded movement as undone (the opposite entry is logged separately). */
export function markReversed(sku: string, id: string): void {
  movementLog.set(
    sku,
    getMovements(sku).map((movement) =>
      movement.id === id ? { ...movement, reversed: true } : movement,
    ),
  );
}
