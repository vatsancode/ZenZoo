import { z } from "zod";
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
  description:
    'List what the shop can sell at one store (its sales catalogue), by name. Each item has its kind (product, or made_to_order for services), category name, whether its price is fixed or agreed per order (custom), its lowest price in rupees as plain text such as "2300", and its variant count. Get storeId from listStores. This is the selling list; listProducts has the full variant details.',
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
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
