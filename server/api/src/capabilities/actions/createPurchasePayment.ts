import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import {
  PURCHASE_PAYMENT_SELECT,
  toPurchasePaymentDto,
  type PurchasePaymentDto,
} from "../purchases/paymentDto";

export interface CreatePurchasePaymentInput {
  purchaseId: string;
  paymentMethodId: string;
  paymentAccountId: string;
  amount: number;
  date: string;
  reference?: string;
  notes?: string;
}

/**
 * The actual rules - only against an ordered/received purchase, and only
 * if the paying account can afford it - both live in the database
 * (trg_purchase_payments_before_insert), reusing the same
 * adjust_account_balance() a transfer uses. This capability only does the
 * cheap upfront check and translates the trigger's own rejections into
 * plain sentences.
 */
export const createPurchasePayment = defineCapability<
  CreatePurchasePaymentInput,
  PurchasePaymentDto
>({
  name: "createPurchasePayment",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    if (!(input.amount > 0)) throw new Error("Enter an amount more than zero.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const purchase = await tx.purchases.findFirst({
          where: { id: input.purchaseId, tenant_id: actor.tenantId },
          select: { store_id: true },
        });
        if (!purchase) throw new Error("That purchase doesn't exist.");
        await assertStoreAccess(actor, purchase.store_id);

        const created = await tx.purchase_payments.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: purchase.store_id,
            purchase_id: input.purchaseId,
            payment_method_id: input.paymentMethodId,
            payment_account_id: input.paymentAccountId,
            amount: input.amount,
            paid_at: new Date(input.date),
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            created_by: actor.userId,
          },
          select: PURCHASE_PAYMENT_SELECT,
        });
        return toPurchasePaymentDto(created);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/not enough balance/i.test(message)) {
        throw new Error("That account doesn't have enough balance for this payment.");
      }
      if (/can only be recorded against an ordered or received purchase/i.test(message)) {
        throw new Error("Place the order before recording a payment.");
      }
      throw error;
    }
  },
});
