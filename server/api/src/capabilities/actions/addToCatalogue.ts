import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";

export interface AddToCatalogueInput {
  storeId: string;
  sellableIds: string[];
}

export interface AddToCatalogueResult {
  /** How many products were actually added - ids already in the catalogue are skipped, not errors. */
  added: number;
}

/** Marks inventory products sellable. Nothing is copied - the catalogue is a view over the same rows. */
export const addToCatalogue = defineCapability<AddToCatalogueInput, AddToCatalogueResult>({
  name: "addToCatalogue",
  kind: "action",
  requiredPermission: "catalogue:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    if (!Array.isArray(input.sellableIds) || input.sellableIds.length === 0) {
      throw new Error("Choose at least one item to import.");
    }

    return runInTenantContext(actor, async (tx) => {
      const { count } = await tx.sellables.updateMany({
        where: {
          id: { in: input.sellableIds },
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          kind: "product",
          is_sellable: false,
        },
        data: { is_sellable: true },
      });
      return { added: count };
    });
  },
});
