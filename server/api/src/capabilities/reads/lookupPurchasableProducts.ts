import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import {
  PURCHASABLE_PRODUCT_SELECT,
  toPurchasableProductDto,
  type PurchasableProductDto,
} from "../products/purchasableDto";

export interface LookupPurchasableProductsInput {
  storeId: string;
}

/**
 * The products and variants the purchase form's picker offers, under "purchases:view" so buying
 * doesn't need access to Stocks. Active only, and only what the form shows - see
 * PurchasableProductDto. The full product list (listProducts) stays under "stocks:view".
 */
export const lookupPurchasableProducts = defineCapability<
  LookupPurchasableProductsInput,
  PurchasableProductDto[]
>({
  name: "lookupPurchasableProducts",
  kind: "read",
  description:
    "Active products and their variants that can be bought from a supplier, by name, as the purchase form's picker lists them. Get storeId from listStores. For full product details use listProducts.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
  requiredPermission: "purchases:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.sellables.findMany({
        where: {
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          kind: "product",
          status: "active",
        },
        orderBy: { name: "asc" },
        select: PURCHASABLE_PRODUCT_SELECT,
      });
      return rows.map(toPurchasableProductDto);
    });
  },
});
