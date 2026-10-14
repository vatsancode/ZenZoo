import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PURCHASE_SELECT, toPurchaseDto, type PurchaseDto } from "../purchases/dto";
import { createDraftPurchase, type CreateDraftPurchaseInput } from "../purchases/createDraftPurchase";

export type CreatePurchaseInput = CreateDraftPurchaseInput;

export const createPurchase = defineCapability<CreatePurchaseInput, PurchaseDto>({
  name: "createPurchase",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    try {
      return await runInTenantContext(actor, async (tx) => {
        const purchase = await createDraftPurchase(tx, actor, input);

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
