import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";

export interface DeleteMadeToOrderItemInput {
  storeId: string;
  id: string;
}

/**
 * "Delete" to the person, archive to the database: past sale_items point at
 * this item's variant, so the row has to stay for those sales to still read
 * correctly. Archived items drop out of the catalogue and the till.
 */
export const deleteMadeToOrderItem = defineCapability<DeleteMadeToOrderItemInput, void>({
  name: "deleteMadeToOrderItem",
  kind: "action",
  requiredPermission: "catalogue:delete",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    await runInTenantContext(actor, async (tx) => {
      const { count } = await tx.sellables.updateMany({
        where: {
          id: input.id,
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          kind: "made_to_order",
          status: "active",
        },
        data: { status: "archived" },
      });
      if (count === 0) throw new Error("That item doesn't exist.");
    });
  },
});
