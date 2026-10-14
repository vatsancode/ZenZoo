import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { CATALOGUE_SELECT, toCatalogueItemDto, type CatalogueItemDto } from "../catalogue/dto";

export interface ListCatalogueInput {
  storeId: string;
}

/** What the till may sell: every active sellable marked sellable - imported products and made-to-order items alike. */
export const listCatalogue = defineCapability<ListCatalogueInput, CatalogueItemDto[]>({
  name: "listCatalogue",
  kind: "read",
  requiredPermission: "catalogue:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.sellables.findMany({
        where: {
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          is_sellable: true,
          status: "active",
        },
        orderBy: { name: "asc" },
        select: CATALOGUE_SELECT,
      });
      return rows.map(toCatalogueItemDto);
    });
  },
});
