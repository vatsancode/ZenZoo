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
