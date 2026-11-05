import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface ListProductsInput {
  storeId: string;
}

export const listProducts = defineCapability<ListProductsInput, ProductDto[]>({
  name: "listProducts",
  kind: "read",
  description:
    'List the products sold at one store, by name, each with its variants (id, name, sku, unit and basePrice), its category id, its status, and its lowest variant price. The variant ids here are the ones listCurrentStock uses, so this is how to find a stock row\'s product name. Get storeId from listStores. Prices are decimal text in rupees, such as "2300" (the decimals can vary).',
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
  requiredPermission: "stocks:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.sellables.findMany({
        where: { tenant_id: actor.tenantId, store_id: input.storeId, kind: "product" },
        orderBy: { name: "asc" },
        select: PRODUCT_SELECT,
      });
      return rows.map(toProductDto);
    });
  },
});
