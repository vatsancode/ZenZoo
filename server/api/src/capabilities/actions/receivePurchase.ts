import { randomUUID } from "crypto";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PURCHASE_SELECT, toPurchaseDto, type PurchaseDto } from "../purchases/dto";

export interface ReceivePurchaseLineInput {
  purchaseItemId: string;
  quantity: number;
}

export interface ReceivePurchaseInput {
  id: string;
  deliveryDate: string;
  /** Only the lines that have something arriving - see ReceiveSheet.tsx. */
  lines: ReceivePurchaseLineInput[];
}

/**
 * Short, greppable, origin-tagged - "B" for a purchase-origin batch, as
 * docs/db-design.md's own B001/R001 example illustrates. No sequence table
 * backs this (there is none in the schema), so the random suffix is what
 * actually guarantees inventory_batches_tenant_barcode_unique never
 * collides, not the prefix.
 */
function generateBarcode(): string {
  return `B${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 6).toUpperCase()}`;
}

/**
 * Records one delivery against an ordered (or already-receiving) purchase.
 * Can be called more than once per purchase - each call only has to cover
 * the lines/quantities that actually arrived this time, matching
 * ReceiveSheet.tsx exactly. "received" is set on the FIRST delivery and
 * never means "fully received" - see docs/db-design.md's own note on
 * purchases_received_at_check. Per line: one inventory_batches row, one
 * matching stock_movements row - purchase_items itself is never touched.
 */
export const receivePurchase = defineCapability<ReceivePurchaseInput, PurchaseDto>({
  name: "receivePurchase",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    const lines = input.lines.filter((line) => line.quantity > 0);
    if (lines.length === 0) throw new Error("Enter how much arrived.");

    return runInTenantContext(actor, async (tx) => {
      const purchase = await tx.purchases.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true, status: true },
      });
      if (!purchase) throw new Error("That purchase doesn't exist.");
      await assertStoreAccess(actor, purchase.store_id);

      if (purchase.status === "draft") {
        throw new Error("Place the order before receiving stock.");
      }
      if (purchase.status === "cancelled") {
        throw new Error("This purchase was cancelled.");
      }

      const deliveryDate = new Date(input.deliveryDate);

      for (const line of lines) {
        const item = await tx.purchase_items.findFirst({
          where: { id: line.purchaseItemId, purchase_id: input.id, tenant_id: actor.tenantId },
          select: {
            id: true,
            variant_id: true,
            quantity: true,
            unit_cost: true,
            inventory_batches: { select: { received_quantity: true } },
          },
        });
        if (!item) throw new Error("One of these lines doesn't belong to this purchase.");

        const alreadyReceived = item.inventory_batches.reduce(
          (sum, batch) => sum + batch.received_quantity,
          0,
        );
        const pending = item.quantity - alreadyReceived;
        if (line.quantity > pending) {
          throw new Error(`Only ${pending} still to come on one of these lines.`);
        }

        const batch = await tx.inventory_batches.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: purchase.store_id,
            variant_id: item.variant_id,
            purchase_item_id: item.id,
            barcode: generateBarcode(),
            received_quantity: line.quantity,
            unit_cost: item.unit_cost,
            received_at: deliveryDate,
          },
          select: { id: true },
        });

        // This is what actually raises available_quantity -
        // trg_stock_movements_apply_to_batch reads this row, the
        // application never writes available_quantity directly.
        await tx.stock_movements.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: purchase.store_id,
            variant_id: item.variant_id,
            batch_id: batch.id,
            movement_type: "PURCHASED",
            quantity: line.quantity,
            reference_type: "PURCHASE_ITEM",
            reference_id: item.id,
            occurred_at: deliveryDate,
            created_by: actor.userId,
          },
        });
      }

      if (purchase.status === "ordered") {
        await tx.purchases.update({
          where: { id: input.id },
          data: { status: "received", received_at: deliveryDate },
        });
      }

      const row = await tx.purchases.findUniqueOrThrow({
        where: { id: input.id },
        select: PURCHASE_SELECT,
      });
      return toPurchaseDto(row);
    });
  },
});
