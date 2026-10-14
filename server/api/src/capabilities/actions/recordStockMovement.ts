import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { STOCK_MOVEMENT_SELECT, toStockMovementDto, type StockMovementDto } from "../stock/dto";
import { recordOpeningStock } from "../stocks/openingStock";

export type StockMovementAction = "add" | "remove" | "count";

export interface RecordStockMovementInput {
  variantId: string;
  /** An existing batch, or null to start a brand-new one - only valid for "add". */
  batchId: string | null;
  action: StockMovementAction;
  /** How many to add/remove, or - for "count" - how many there actually are right now. */
  quantity: number;
  /** Cost per unit for a brand-new batch. Required when batchId is null. */
  unitCost?: number;
  note?: string;
}

/**
 * The hand-recorded counterpart to receiveLines/recordOpeningStock: stock
 * moving for a reason that isn't a purchase, a sale, or a return - found
 * stock, shrinkage, a correction after a physical count. Always append-only,
 * same as every other stock_movements write (see stock_movements_reject_change
 * - this table can't be edited, only added to).
 */
export const recordStockMovement = defineCapability<RecordStockMovementInput, StockMovementDto>({
  name: "recordStockMovement",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
    if (input.quantity <= 0) throw new Error("Enter a quantity above 0.");

    return runInTenantContext(actor, async (tx) => {
      const variant = await tx.variants.findFirst({
        where: { id: input.variantId, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!variant) throw new Error("That variant doesn't exist.");
      await assertStoreAccess(actor, variant.store_id);

      if (input.batchId === null) {
        if (input.action !== "add") throw new Error("Only adding stock can start a new batch.");
        if (input.unitCost == null || input.unitCost < 0) {
          throw new Error("Give the new batch a cost per unit.");
        }

        // A batch with no purchase or return behind it is only legal when
        // its very first movement is OPENING_STOCK (trg_fn_inventory_batches_
        // insert_guard) - a new batch started from this screen is, to the
        // database, the same honest shape as opening stock arriving late.
        const { movementId } = await recordOpeningStock(tx, actor, {
          storeId: variant.store_id,
          variantId: input.variantId,
          quantity: input.quantity,
          unitCost: input.unitCost,
          date: new Date().toISOString().slice(0, 10),
          reason: input.note,
        });

        const movement = await tx.stock_movements.findUniqueOrThrow({
          where: { id: movementId },
          select: STOCK_MOVEMENT_SELECT,
        });
        return toStockMovementDto(movement);
      }

      const batch = await tx.inventory_batches.findFirst({
        where: {
          id: input.batchId,
          tenant_id: actor.tenantId,
          store_id: variant.store_id,
          variant_id: input.variantId,
        },
        select: { available_quantity: true },
      });
      if (!batch) throw new Error("That batch doesn't exist.");

      let movementType: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
      let quantity: number;
      if (input.action === "add") {
        movementType = "ADJUSTMENT_IN";
        quantity = input.quantity;
      } else if (input.action === "remove") {
        if (input.quantity > batch.available_quantity) {
          throw new Error(
            batch.available_quantity === 0
              ? "This batch has no stock left."
              : `Only ${batch.available_quantity} left in this batch.`,
          );
        }
        movementType = "ADJUSTMENT_OUT";
        quantity = input.quantity;
      } else {
        const delta = input.quantity - batch.available_quantity;
        if (delta === 0) {
          throw new Error("That matches what we already have, so there is nothing to fix.");
        }
        movementType = delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
        quantity = Math.abs(delta);
      }

      const movement = await tx.stock_movements.create({
        data: {
          tenant_id: actor.tenantId,
          store_id: variant.store_id,
          variant_id: input.variantId,
          batch_id: input.batchId,
          movement_type: movementType,
          quantity,
          reason: input.note?.trim() || null,
          occurred_at: new Date(),
          created_by: actor.userId,
        },
        select: STOCK_MOVEMENT_SELECT,
      });
      return toStockMovementDto(movement);
    });
  },
});
