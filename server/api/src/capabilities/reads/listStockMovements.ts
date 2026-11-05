import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { STOCK_MOVEMENT_SELECT, toStockMovementDto, type StockMovementDto } from "../stock/dto";

export interface ListStockMovementsInput {
  variantId: string;
}

/** The real ledger for one variant, newest first - what StockMovementsTab shows. Append-only; nothing here can be edited or undone. */
export const listStockMovements = defineCapability<ListStockMovementsInput, StockMovementDto[]>({
  name: "listStockMovements",
  kind: "read",
  description:
    "Every stock movement for one product variant, newest first: the movement type, quantity, batch, reason and when it happened. This is a log; nothing here can be changed.",
  input: z.object({
    variantId: z.string().describe("The product variant's id."),
  }),
  requiredPermission: "stocks:view",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const variant = await tx.variants.findFirst({
        where: { id: input.variantId, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!variant) throw new Error("That variant doesn't exist.");
      await assertStoreAccess(actor, variant.store_id);

      const rows = await tx.stock_movements.findMany({
        where: {
          tenant_id: actor.tenantId,
          store_id: variant.store_id,
          variant_id: input.variantId,
        },
        orderBy: { occurred_at: "desc" },
        select: STOCK_MOVEMENT_SELECT,
      });
      return rows.map(toStockMovementDto);
    });
  },
});
