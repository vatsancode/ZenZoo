export interface PurchaseBatchDto {
  quantity: number;
  receivedAt: string;
}

export interface PurchaseItemDto {
  id: string;
  variantId: string;
  /** "<product name> - <variant name>", so the frontend needs no second lookup per line. */
  name: string;
  sku: string | null;
  quantity: number;
  unitCost: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  /** Summed from inventory_batches, not stored - see receivePurchase. */
  receivedQuantity: number;
  pendingQuantity: number;
  /** One entry per delivery that touched this line - how the "Deliveries" log is reconstructed, grouped by receivedAt. */
  batches: PurchaseBatchDto[];
}

export interface PurchaseDto {
  id: string;
  storeId: string;
  supplierId: string;
  referenceNumber: string | null;
  purchaseDate: string;
  status: "draft" | "ordered" | "received" | "cancelled";
  /**
   * Never stored - "received" only means receiving has started (see
   * docs/db-design.md). Computed every read by comparing each item's
   * receivedQuantity against its quantity. null unless status is "received".
   */
  fullyReceived: boolean | null;
  subtotalAmount: string;
  discountAmount: string;
  taxAmount: string;
  adjustmentAmount: string;
  totalAmount: string;
  receivedAt: string | null;
  items: PurchaseItemDto[];
}

interface PurchaseItemRow {
  id: string;
  variant_id: string;
  quantity: number;
  unit_cost: { toString(): string };
  discount_amount: { toString(): string };
  tax_amount: { toString(): string };
  line_total: { toString(): string };
  variants: { name: string; sku: string | null; sellables: { name: string } };
  inventory_batches: { received_quantity: number; received_at: Date }[];
}

interface PurchaseRow {
  id: string;
  store_id: string;
  supplier_id: string;
  reference_number: string | null;
  purchase_date: Date;
  status: string;
  subtotal_amount: { toString(): string };
  discount_amount: { toString(): string };
  tax_amount: { toString(): string };
  adjustment_amount: { toString(): string };
  total_amount: { toString(): string };
  received_at: Date | null;
  purchase_items: PurchaseItemRow[];
}

function toPurchaseItemDto(row: PurchaseItemRow): PurchaseItemDto {
  const receivedQuantity = row.inventory_batches.reduce(
    (sum, batch) => sum + batch.received_quantity,
    0,
  );
  return {
    id: row.id,
    variantId: row.variant_id,
    name: `${row.variants.sellables.name} - ${row.variants.name}`,
    sku: row.variants.sku,
    quantity: row.quantity,
    unitCost: row.unit_cost.toString(),
    discountAmount: row.discount_amount.toString(),
    taxAmount: row.tax_amount.toString(),
    lineTotal: row.line_total.toString(),
    receivedQuantity,
    pendingQuantity: Math.max(row.quantity - receivedQuantity, 0),
    batches: row.inventory_batches.map((batch) => ({
      quantity: batch.received_quantity,
      receivedAt: batch.received_at.toISOString(),
    })),
  };
}

export function toPurchaseDto(row: PurchaseRow): PurchaseDto {
  const items = row.purchase_items.map(toPurchaseItemDto);
  const status = row.status as PurchaseDto["status"];
  return {
    id: row.id,
    storeId: row.store_id,
    supplierId: row.supplier_id,
    referenceNumber: row.reference_number,
    purchaseDate: row.purchase_date.toISOString(),
    status,
    fullyReceived:
      status === "received" ? items.every((item) => item.pendingQuantity === 0) : null,
    subtotalAmount: row.subtotal_amount.toString(),
    discountAmount: row.discount_amount.toString(),
    taxAmount: row.tax_amount.toString(),
    adjustmentAmount: row.adjustment_amount.toString(),
    totalAmount: row.total_amount.toString(),
    receivedAt: row.received_at?.toISOString() ?? null,
    items,
  };
}

export const PURCHASE_ITEM_SELECT = {
  id: true,
  variant_id: true,
  quantity: true,
  unit_cost: true,
  discount_amount: true,
  tax_amount: true,
  line_total: true,
  variants: { select: { name: true, sku: true, sellables: { select: { name: true } } } },
  inventory_batches: { select: { received_quantity: true, received_at: true } },
} as const;

export const PURCHASE_SELECT = {
  id: true,
  store_id: true,
  supplier_id: true,
  reference_number: true,
  purchase_date: true,
  status: true,
  subtotal_amount: true,
  discount_amount: true,
  tax_amount: true,
  adjustment_amount: true,
  total_amount: true,
  received_at: true,
  purchase_items: { select: PURCHASE_ITEM_SELECT },
} as const;
