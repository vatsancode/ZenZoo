import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PURCHASE_SELECT, toPurchaseDto, type PurchaseDto } from "../purchases/dto";
import {
  createDraftPurchase,
  type CreateDraftPurchaseInput,
} from "../purchases/createDraftPurchase";
import { receiveLines } from "../purchases/receiveLines";

export type RecordReceivedPurchaseInput = CreateDraftPurchaseInput;

/**
 * For stores that record a purchase only after it's already been paid for
 * and shelved - skips the separate "place order" / "receive stock" clicks
 * and does both immediately, in one transaction, right after creating the
 * draft. Built on the exact same building blocks createPurchase and
 * receivePurchase use (createDraftPurchase, receiveLines) rather than its
 * own copy of that logic - see their own comments for why. The purchase
 * still genuinely passes through draft -> ordered -> received, same as any
 * purchase does; this just does all three in one click instead of three.
 */
export const recordReceivedPurchase = defineCapability<RecordReceivedPurchaseInput, PurchaseDto>({
  name: "recordReceivedPurchase",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    try {
      return await runInTenantContext(actor, async (tx) => {
        const purchase = await createDraftPurchase(tx, actor, input);

        await tx.purchases.update({
          where: { id: purchase.id },
          data: { status: "ordered" },
        });

        await receiveLines(tx, actor, {
          purchaseId: purchase.id,
          deliveryDate: input.purchaseDate,
          // Full receipt of every line - "already received" means all of
          // it arrived, not some pending amount to reconcile against later.
          lines: purchase.items.map((item) => ({
            purchaseItemId: item.id,
            quantity: item.quantity,
          })),
        });

        const row = await tx.purchases.findUniqueOrThrow({
          where: { id: purchase.id },
          select: PURCHASE_SELECT,
        });
        return toPurchaseDto(row);
      });
    } catch (error) {
      // idx_purchases_supplier_reference_unique
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("This supplier already has a purchase with that reference number.");
      }
      throw error;
    }
  },
});
