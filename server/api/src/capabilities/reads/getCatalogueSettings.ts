import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { CatalogueSettingsDto } from "../catalogue/dto";

export interface GetCatalogueSettingsInput {
  storeId: string;
}

export const getCatalogueSettings = defineCapability<
  GetCatalogueSettingsInput,
  CatalogueSettingsDto
>({
  name: "getCatalogueSettings",
  kind: "read",
  requiredPermission: "catalogue:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const store = await tx.stores.findFirstOrThrow({
        where: { id: input.storeId, tenant_id: actor.tenantId },
        select: { catalogue_auto_import: true },
      });
      return { autoImport: store.catalogue_auto_import };
    });
  },
});
