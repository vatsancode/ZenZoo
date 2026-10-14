import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";
import { generateBarcode } from "../purchases/barcode";

export interface RecordOpeningStockInput {
  storeId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
  date: string;
  /** Free-text reason, stored as the movement's `reason` - e.g. why stock is starting outside a purchase. */
  reason?: string;
}

/**
 * Records a variant's starting stock as a real, honestly-labeled batch -
 * not a disguised purchase. inventory_batches_origin_check allows a batch
 * to have neither a purchase_item_id nor a sale_return_item_id (just
 * "not both"), and stock_movements_reference_pair_check already allows a
 * movement with no reference at all - so this needs no schema concept
 * beyond what both tables already had. Same two-step shape every other
 * kind of stock entry uses (see receiveLines): one batch row, one
 * movement row - trg_stock_movements_apply_to_batch is what actually
 * raises available_quantity, same as it does for a purchase.
 */
export interface RecordedOpeningStock {
  batchId: string;
  movementId: string;
}

export async function recordOpeningStock(
  tx: TenantTx,
  actor: CapabilityActor,
  input: RecordOpeningStockInput,
): Promise<RecordedOpeningStock> {
  const occurredAt = new Date(input.date);

  const batch = await tx.inventory_batches.create({
    data: {
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      variant_id: input.variantId,
      barcode: generateBarcode(),
      received_quantity: input.quantity,
      unit_cost: input.unitCost,
      received_at: occurredAt,
    },
    select: { id: true },
  });

  const movement = await tx.stock_movements.create({
    data: {
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      variant_id: input.variantId,
      batch_id: batch.id,
      movement_type: "OPENING_STOCK",
      quantity: input.quantity,
      reason: input.reason?.trim() || null,
      occurred_at: occurredAt,
      created_by: actor.userId,
    },
    select: { id: true },
  });

  return { batchId: batch.id, movementId: movement.id };
}
