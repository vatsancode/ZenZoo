import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import {
  PURCHASE_PAYMENT_SELECT,
  toPurchasePaymentDto,
  type PurchasePaymentDto,
} from "../purchases/paymentDto";

export interface ListPurchasePaymentsInput {
  purchaseId: string;
}

export const listPurchasePayments = defineCapability<ListPurchasePaymentsInput, PurchasePaymentDto[]>({
  name: "listPurchasePayments",
  kind: "read",
  requiredPermission: "purchases:view",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const purchase = await tx.purchases.findFirst({
        where: { id: input.purchaseId, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!purchase) throw new Error("That purchase doesn't exist.");
      await assertStoreAccess(actor, purchase.store_id);

      const rows = await tx.purchase_payments.findMany({
        where: { tenant_id: actor.tenantId, purchase_id: input.purchaseId },
        orderBy: { created_at: "desc" },
        select: PURCHASE_PAYMENT_SELECT,
      });
      return rows.map(toPurchasePaymentDto);
    });
  },
});
