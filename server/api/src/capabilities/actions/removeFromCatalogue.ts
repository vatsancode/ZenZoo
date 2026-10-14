import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";

export interface RemoveFromCatalogueInput {
  storeId: string;
  id: string;
}

/**
 * Takes a product off the catalogue - it stays in inventory, untouched. With
 * auto-import on it stays off too: auto-import only acts on new products and
 * at the moment it's switched on, never re-adding something removed by hand.
 */
export const removeFromCatalogue = defineCapability<RemoveFromCatalogueInput, void>({
  name: "removeFromCatalogue",
  kind: "action",
  requiredPermission: "catalogue:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    await runInTenantContext(actor, async (tx) => {
      const row = await tx.sellables.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId, store_id: input.storeId },
        select: { kind: true },
      });
      if (!row) throw new Error("That item doesn't exist.");
      // A made-to-order item has no inventory to fall back to - removing it is deleting it, a separate action.
      if (row.kind !== "product")
        throw new Error("Only inventory products can be removed this way.");
      await tx.sellables.update({ where: { id: input.id }, data: { is_sellable: false } });
    });
  },
});
