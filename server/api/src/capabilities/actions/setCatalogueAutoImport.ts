import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { CatalogueSettingsDto } from "../catalogue/dto";

export interface SetCatalogueAutoImportInput {
  storeId: string;
  on: boolean;
}

export interface SetCatalogueAutoImportResult extends CatalogueSettingsDto {
  /** Products brought in by switching it on - 0 when switching off. */
  added: number;
}

/**
 * "Keep importing all new inventory items". Switching it on also imports
 * every product not yet in the catalogue, in the same transaction - "all"
 * means all, so there is no state where it's on but some products were
 * left behind. From then on createProduct marks new products sellable itself.
 */
export const setCatalogueAutoImport = defineCapability<
  SetCatalogueAutoImportInput,
  SetCatalogueAutoImportResult
>({
  name: "setCatalogueAutoImport",
  kind: "action",
  requiredPermission: "catalogue:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    if (typeof input.on !== "boolean") throw new Error("Say whether auto-import is on or off.");

    return runInTenantContext(actor, async (tx) => {
      await tx.stores.update({
        where: { id: input.storeId },
        data: { catalogue_auto_import: input.on },
      });
      if (!input.on) return { autoImport: false, added: 0 };

      const { count } = await tx.sellables.updateMany({
        where: {
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          kind: "product",
          is_sellable: false,
          status: "active",
        },
        data: { is_sellable: true },
      });
      return { autoImport: true, added: count };
    });
  },
});
