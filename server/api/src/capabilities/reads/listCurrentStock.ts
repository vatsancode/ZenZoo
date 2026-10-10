import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { CurrentStockDto } from "../stock/dto";

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
        onHand: row._sum.available_quantity ?? 0,
      }));
    });
  },
});
