import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { BATCH_SELECT, toBatchDto, type BatchDto } from "../stock/dto";

export interface ListInventoryBatchesInput {
  variantId: string;
}

/** Batches still holding stock for one variant, oldest first (FIFO display order) - what CurrentBatchesTab shows. */
export const listInventoryBatches = defineCapability<ListInventoryBatchesInput, BatchDto[]>({
  name: "listInventoryBatches",
  kind: "read",
  requiredPermission: "stocks:view",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const variant = await tx.variants.findFirst({
        where: { id: input.variantId, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!variant) throw new Error("That variant doesn't exist.");
      await assertStoreAccess(actor, variant.store_id);

      const rows = await tx.inventory_batches.findMany({
        where: {
          tenant_id: actor.tenantId,
          store_id: variant.store_id,
          variant_id: input.variantId,
          available_quantity: { gt: 0 },
        },
        orderBy: { received_at: "asc" },
        select: BATCH_SELECT,
      });
      return rows.map(toBatchDto);
    });
  },
});
