import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { SaleDto } from "../sales/dto";
import { findSale } from "../sales/recordSale";

export interface GetSaleInput {
  storeId: string;
  id: string;
}

export const getSale = defineCapability<GetSaleInput, SaleDto>({
  name: "getSale",
  kind: "read",
  description:
    'One sale in full: its lines, payments and any returns. Get storeId from listStores and the sale id from listSales. Money amounts are decimal text in rupees, such as "250.00". Fails if the sale does not exist.',
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
    id: z.string().describe("The sale's id, from listSales."),
  }),
  requiredPermission: "sales:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, async (tx) => {
      const sale = await findSale(tx, actor, input.storeId, input.id);
      if (!sale) throw new Error("That sale doesn't exist.");
      return sale;
    });
  },
});
