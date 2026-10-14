import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { CATALOGUE_SELECT, toCatalogueItemDto, type CatalogueItemDto } from "../catalogue/dto";

export interface ListCatalogueCandidatesInput {
  storeId: string;
}

/** Active inventory products not yet in the catalogue - what "Import from inventory" offers. */
export const listCatalogueCandidates = defineCapability<
  ListCatalogueCandidatesInput,
  CatalogueItemDto[]
>({
  name: "listCatalogueCandidates",
  kind: "read",
  requiredPermission: "catalogue:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.sellables.findMany({
        where: {
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          kind: "product",
          is_sellable: false,
          status: "active",
        },
        orderBy: { name: "asc" },
        select: CATALOGUE_SELECT,
      });
      return rows.map(toCatalogueItemDto);
    });
  },
});
