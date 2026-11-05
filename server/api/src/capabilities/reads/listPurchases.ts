import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PURCHASE_SELECT, toPurchaseDto, type PurchaseDto } from "../purchases/dto";

export interface ListPurchasesInput {
  storeId: string;
}

export const listPurchases = defineCapability<ListPurchasesInput, PurchaseDto[]>({
  name: "listPurchases",
  kind: "read",
  description:
    "List the stock purchases made at one store, newest first. Each has its supplierId, reference number, purchase date, status (draft, ordered, received or cancelled), whether it was fully received, its subtotal, discount, tax, adjustment and total, and its items (variant, quantity, unit cost and line total). Get storeId from listStores and supplier names from listSuppliers. Money amounts are decimal text in rupees.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
  requiredPermission: "purchases:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.purchases.findMany({
        where: { tenant_id: actor.tenantId, store_id: input.storeId },
        orderBy: { created_at: "desc" },
        select: PURCHASE_SELECT,
      });
      return rows.map(toPurchaseDto);
    });
  },
});
