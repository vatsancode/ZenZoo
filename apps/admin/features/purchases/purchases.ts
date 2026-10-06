import type { Unit } from "../../lib/stocks";

// "partially_received" is a working state the screens offer; the `purchases` table in
// docs/db-design.md has no such status yet (receiving there is tracked per line), so it
// would need adding when this moves to a real backend.
export const PURCHASE_STATUSES = [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

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
  /** The variant's SKU, or the product's SKU when it has no variants. */
  sku: string;
  productId: string;
  name: string;
  unit: Unit;
  quantity: number;
  unitCost: number;
  /** Money taken off this line, in rupees (`discount_amount` on `purchase_items`). */
  discount?: number;
  /** How much has arrived so far. Only set once the purchase is partially or fully received. */
  received?: number;
  /** How much of what arrived has been sent back to the vendor. */
  returned?: number;
}

export interface PurchasePayment {
  amount: number;
  /** A `payment_methods` code, e.g. UPI. */
  method: string;
  /** A `payment_accounts` code: where the money was paid from. */
  accountId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
}

/** One delivery: what arrived on a given day. A purchase can have several. */
export interface Delivery {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  items: { sku: string; name: string; unit: Unit; quantity: number }[];
}

export const RETURN_REASONS = [
  "Damaged",
  "Wrong item",
  "Quality issue",
  "Excess quantity",
  "Other",
] as const;

/**
 * How the money for returned goods is handled. The `purchase_returns` tables in
 * docs/db-design.md carry no money columns yet, so this lives on the return.
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
  items: { sku: string; name: string; unit: Unit; quantity: number; unitCredit: number }[];
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

export interface Purchase {
  id: string;
  vendorId: string;
  /** The vendor's invoice number. Unique per vendor, unless the purchase is cancelled. */
  reference?: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  status: PurchaseStatus;
  total: number;
  items?: PurchaseItem[];
  discount?: number;
  tax?: number;
  adjustment?: number;
  /** Paid up front when the purchase was created; one entry per payment. */
  payments?: PurchasePayment[];
  /** Every delivery received so far, oldest first. */
  deliveries?: Delivery[];
  /** Goods sent back to the vendor, oldest first. */
  returns?: PurchaseReturn[];
}

export interface PurchaseInput {
  vendorId: string;
  reference: string;
  date: string;
  status: PurchaseStatus;
  items: PurchaseItem[];
  discount: number;
  tax: number;
  adjustment: number;
  /** Empty when nothing has been paid yet. */
  payments: PurchasePayment[];
}

export function lineTotal(item: PurchaseItem): number {
  return Math.round((item.quantity * item.unitCost - (item.discount ?? 0)) * 100) / 100;
}

/** Same rule as the `purchases` table: subtotal - discount + tax + adjustment. */
export function purchaseTotals(
  items: PurchaseItem[],
  discount: number,
  tax: number,
  adjustment: number,
) {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const total = Math.round((subtotal - discount + tax + adjustment) * 100) / 100;
  return { subtotal, total };
}

// Sample data standing in for a real capability, same as lib/stocks.ts: there
// is no purchases read capability on the backend yet. Fields mirror the
// `purchases` and `purchase_items` tables in docs/db-design.md; payments have
// no table yet, so the payment lives on the purchase for now. Swap
// the bodies of listPurchases/savePurchases for real API calls once the
// capability exists.
/** Builds a sample line so the seed rows below stay readable. */
function line(
  sku: string,
  productId: string,
  name: string,
  quantity: number,
  unitCost: number,
  received?: number,
  returned?: number,
): PurchaseItem {
  return { sku, productId, name, unit: "pcs", quantity, unitCost, received, returned };
}

let store: Purchase[] = [
  {
    id: "pur-1",
    vendorId: "sup-1",
    reference: "KS/2026/0412",
    date: "2026-09-28",
    status: "received",
    total: 184500,
    items: [
      line("SKU-SR-1001", "SKU-SR-1001", "Kanchipuram silk saree, maroon", 10, 11000, 10),
      line("SKU-SR-1005", "SKU-SR-1005", "Chanderi saree, pastel green", 20, 3500, 20, 2),
    ],
    returns: [
      {
        id: "ret-1",
        date: "2026-10-02",
        reason: "Damaged",
        note: "Torn border on two pieces",
        items: [
          {
            sku: "SKU-SR-1005",
            name: "Chanderi saree, pastel green",
            unit: "pcs",
            quantity: 2,
            unitCredit: 3500,
          },
        ],
        credit: 7000,
        refund: { mode: "pending", amount: 7000 },
      },
    ],
    tax: 4500,
    payments: [
      { amount: 100000, method: "BANK_TRANSFER", accountId: "hdfc-current", date: "2026-09-28" },
    ],
    deliveries: [
      {
        date: "2026-09-30",
        items: [
          { sku: "SKU-SR-1001", name: "Kanchipuram silk saree, maroon", unit: "pcs", quantity: 10 },
          { sku: "SKU-SR-1005", name: "Chanderi saree, pastel green", unit: "pcs", quantity: 20 },
        ],
      },
    ],
  },
  {
    id: "pur-2",
    vendorId: "sup-2",
    reference: "VW-1187",
    date: "2026-09-24",
    status: "ordered",
    total: 96250,
    items: [
      line("SKU-SR-1002", "SKU-SR-1002", "Banarasi silk saree, royal blue", 5, 12800, 0),
      line("SKU-SR-1003", "SKU-SR-1003", "Handloom cotton saree, mustard", 12, 2600, 0),
    ],
    tax: 1050,
    payments: [{ amount: 30000, method: "UPI", accountId: "hdfc-current", date: "2026-09-24" }],
  },
  {
    id: "pur-3",
    vendorId: "sup-3",
    reference: "JBP/09/231",
    date: "2026-09-19",
    status: "partially_received",
    total: 57000,
    items: [
      line("SKU-SW-2001-S", "salwar-cotton-set", "Cotton salwar set, printed - S", 20, 950, 20),
      line("SKU-SW-2001-M", "salwar-cotton-set", "Cotton salwar set, printed - M", 20, 950, 10),
      line("SKU-SW-2001-L", "salwar-cotton-set", "Cotton salwar set, printed - L", 20, 950, 0),
    ],
    deliveries: [
      {
        date: "2026-09-22",
        items: [
          {
            sku: "SKU-SW-2001-S",
            name: "Cotton salwar set, printed - S",
            unit: "pcs",
            quantity: 20,
          },
          {
            sku: "SKU-SW-2001-M",
            name: "Cotton salwar set, printed - M",
            unit: "pcs",
            quantity: 5,
          },
        ],
      },
      {
        date: "2026-09-26",
        items: [
          {
            sku: "SKU-SW-2001-M",
            name: "Cotton salwar set, printed - M",
            unit: "pcs",
            quantity: 5,
          },
        ],
      },
    ],
  },
  {
    id: "pur-4",
    vendorId: "sup-4",
    date: "2026-09-12",
    status: "draft",
    total: 63600,
    items: [
      line("SKU-SR-1003", "SKU-SR-1003", "Handloom cotton saree, mustard", 15, 2600),
      line("SKU-SR-1004", "SKU-SR-1004", "Georgette party-wear saree, wine", 6, 4100),
    ],
  },
  {
    id: "pur-5",
    vendorId: "sup-1",
    reference: "KS/2026/0388",
    date: "2026-09-03",
    status: "received",
    total: 121000,
    items: [line("SKU-SR-1001", "SKU-SR-1001", "Kanchipuram silk saree, maroon", 11, 11000, 11)],
    payments: [{ amount: 121000, method: "UPI", accountId: "hdfc-current", date: "2026-09-03" }],
    deliveries: [
      {
        date: "2026-09-05",
        items: [
          { sku: "SKU-SR-1001", name: "Kanchipuram silk saree, maroon", unit: "pcs", quantity: 11 },
        ],
      },
    ],
  },
  {
    id: "pur-6",
    vendorId: "sup-2",
    reference: "VW-1162",
    date: "2026-08-27",
    status: "cancelled",
    total: 31200,
    items: [line("SKU-SR-1003", "SKU-SR-1003", "Handloom cotton saree, mustard", 12, 2600)],
  },
];

export async function listPurchases(): Promise<Purchase[]> {
  return store;
}

export function savePurchases(next: Purchase[]): void {
  store = next;
}

export function addPurchase(purchases: Purchase[], input: PurchaseInput): Purchase[] {
  const purchase: Purchase = {
    id: `pur-${Date.now()}`,
    vendorId: input.vendorId,
    reference: input.reference.trim() || undefined,
    date: input.date,
    status: input.status,
    total: purchaseTotals(input.items, input.discount, input.tax, input.adjustment).total,
    items: input.items,
    discount: input.discount,
    tax: input.tax,
    adjustment: input.adjustment,
    payments: input.payments,
  };
  return [purchase, ...purchases];
}

/** Rewrites a draft purchase; its payments, deliveries and returns are kept as they are. */
export function updatePurchase(
  purchases: Purchase[],
  id: string,
  input: PurchaseInput,
): Purchase[] {
  return purchases.map((purchase) =>
    purchase.id === id
      ? {
          ...purchase,
          vendorId: input.vendorId,
          reference: input.reference.trim() || undefined,
          date: input.date,
          status: input.status,
          total: purchaseTotals(input.items, input.discount, input.tax, input.adjustment).total,
          items: input.items,
          discount: input.discount,
          tax: input.tax,
          adjustment: input.adjustment,
          payments: input.payments,
        }
      : purchase,
  );
}

/** The same vendor invoice can't be entered twice, unless the earlier one was cancelled. */
export function referenceClash(
  purchases: Purchase[],
  vendorId: string,
  reference: string,
  status: PurchaseStatus,
  ignoreId?: string,
): boolean {
  const wanted = reference.trim().toLowerCase();
  if (!wanted || status === "cancelled") return false;
  return purchases.some(
    (purchase) =>
      purchase.id !== ignoreId &&
      purchase.vendorId === vendorId &&
      purchase.status !== "cancelled" &&
      purchase.reference?.toLowerCase() === wanted,
  );
}

export async function getPurchase(id: string): Promise<Purchase | null> {
  return store.find((purchase) => purchase.id === id) ?? null;
}

/** Units ordered, and how many of them have arrived so far. */
export function receivingProgress(purchase: Purchase): { ordered: number; received: number } {
  const items = purchase.items ?? [];
  return {
    ordered: items.reduce((sum, item) => sum + item.quantity, 0),
    received: items.reduce((sum, item) => sum + (item.received ?? 0), 0),
  };
}

export function totalPaid(purchase: Purchase): number {
  const paid = (purchase.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  return Math.round(paid * 100) / 100;
}

/** A purchase can take delivery once it is ordered, and until everything has arrived. */
export function canReceive(purchase: Purchase): boolean {
  return purchase.status === "ordered" || purchase.status === "partially_received";
}

/** Nothing has arrived yet, so the order can still be dropped (received is terminal). */
export function canCancel(purchase: Purchase): boolean {
  return purchase.status === "draft" || purchase.status === "ordered";
}

export function setPurchaseStatus(
  purchases: Purchase[],
  id: string,
  status: PurchaseStatus,
): Purchase[] {
  return purchases.map((purchase) => (purchase.id === id ? { ...purchase, status } : purchase));
}

/**
 * Records a delivery: adds `arrived` (quantity by SKU) to each line, never past
 * what was ordered, and logs it in the purchase's delivery history. The
 * purchase becomes received once every line is complete, and partially
 * received while some are still pending.
 */
export function receiveItems(
  purchases: Purchase[],
  id: string,
  arrived: Record<string, number>,
  date: string,
): Purchase[] {
  return purchases.map((purchase) => {
    if (purchase.id !== id) return purchase;
    const before = purchase.items ?? [];
    const items = before.map((item) => ({
      ...item,
      received: Math.min(item.quantity, (item.received ?? 0) + (arrived[item.sku] ?? 0)),
    }));
    // What actually landed on each line, after the cap.
    const delivered = items
      .map((item, index) => ({
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantity: (item.received ?? 0) - (before[index]?.received ?? 0),
      }))
      .filter((entry) => entry.quantity > 0);
    const complete = items.every((item) => (item.received ?? 0) >= item.quantity);
    const any = items.some((item) => (item.received ?? 0) > 0);
    const status: PurchaseStatus = complete
      ? "received"
      : any
        ? "partially_received"
        : purchase.status;
    const deliveries =
      delivered.length > 0
        ? [...(purchase.deliveries ?? []), { date, items: delivered }]
        : (purchase.deliveries ?? []);
    return { ...purchase, items, status, deliveries };
  });
}

export function creditTotal(purchase: Purchase): number {
  const credit = (purchase.returns ?? []).reduce((sum, ret) => sum + ret.credit, 0);
  return Math.round(credit * 100) / 100;
}

/** Money the vendor has already paid back. */
export function refundedTotal(purchase: Purchase): number {
  const back = (purchase.returns ?? [])
    .filter((ret) => ret.refund.mode === "refunded")
    .reduce((sum, ret) => sum + ret.refund.amount, 0);
  return Math.round(back * 100) / 100;
}

/**
 * What is still owed to the vendor: the total, less the credit for goods sent
 * back, less what has been paid (net of refunds that came back). Negative means
 * the vendor owes you - a refund still pending, or a credit.
 */
export function purchaseBalance(purchase: Purchase): number {
  const owed = purchase.total - creditTotal(purchase);
  const paid = totalPaid(purchase) - refundedTotal(purchase);
  return Math.round((owed - paid) * 100) / 100;
}

/** What each unit actually cost: the line total (after its discount) over the quantity. */
export function unitCredit(item: PurchaseItem): number {
  return item.quantity > 0 ? Math.round((lineTotal(item) / item.quantity) * 100) / 100 : 0;
}

/** Units that arrived and have not gone back. */
export function returnableOf(item: PurchaseItem): number {
  return Math.max((item.received ?? 0) - (item.returned ?? 0), 0);
}

/** Goods can go back once some have arrived and until all of them have been returned. */
export function canReturn(purchase: Purchase): boolean {
  return (
    (purchase.status === "partially_received" || purchase.status === "received") &&
    (purchase.items ?? []).some((item) => returnableOf(item) > 0)
  );
}

/** Logs a return and counts its units against the lines. The purchase status is left alone. */
export function addReturn(purchases: Purchase[], id: string, ret: PurchaseReturn): Purchase[] {
  return purchases.map((purchase) => {
    if (purchase.id !== id) return purchase;
    const items = (purchase.items ?? []).map((item) => {
      const back = ret.items.find((entry) => entry.sku === item.sku)?.quantity ?? 0;
      return back > 0 ? { ...item, returned: (item.returned ?? 0) + back } : item;
    });
    return { ...purchase, items, returns: [...(purchase.returns ?? []), ret] };
  });
}

/** The vendor's refund has come in: record how and when. */
export function markRefundReceived(
  purchases: Purchase[],
  id: string,
  returnId: string,
  details: { amount: number; method: string; accountId: string; date: string },
): Purchase[] {
  return purchases.map((purchase) =>
    purchase.id === id
      ? {
          ...purchase,
          returns: (purchase.returns ?? []).map((ret) =>
            ret.id === returnId
              ? { ...ret, refund: { ...ret.refund, mode: "refunded" as const, ...details } }
              : ret,
          ),
        }
      : purchase,
  );
}

/** Whether more payments can be recorded: not for a cancelled purchase, and not once it is settled. */
export function canPay(purchase: Purchase): boolean {
  return purchase.status !== "cancelled" && purchaseBalance(purchase) > 0;
}

/** Adds payments to an existing purchase. */
export function addPayments(
  purchases: Purchase[],
  id: string,
  payments: PurchasePayment[],
): Purchase[] {
  return purchases.map((purchase) =>
    purchase.id === id
      ? { ...purchase, payments: [...(purchase.payments ?? []), ...payments] }
      : purchase,
  );
}
