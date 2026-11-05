import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { CurrentStockDto } from "../stock/dto";
import { toQuantity } from "../../shared/quantity";

export interface ListCurrentStockInput {
  storeId: string;
}

/**
 * Mirrors docs/db-design.md's documented fast operational path exactly:
 * SUM(available_quantity) GROUP BY variant_id - available_quantity is
 * trigger-maintained off stock_movements, never app-written, so this is
 * always the real number, not a cache of it.
 */
export const listCurrentStock = defineCapability<ListCurrentStockInput, CurrentStockDto[]>({
  name: "listCurrentStock",
  kind: "read",
  description:
    "How much of each product variant is in stock at one store right now. Each row is a variantId (an id only) and onHand, the quantity in that item's own unit. Get storeId from listStores.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
  requiredPermission: "stocks:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.inventory_batches.groupBy({
        by: ["variant_id"],
        where: { tenant_id: actor.tenantId, store_id: input.storeId },
        _sum: { available_quantity: true },
      });
      return rows.map((row) => ({
        variantId: row.variant_id,
        onHand: toQuantity(row._sum.available_quantity),
      }));
    });
  },
});
