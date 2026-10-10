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
