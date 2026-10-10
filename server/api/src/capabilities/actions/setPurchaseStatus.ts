import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PURCHASE_SELECT, toPurchaseDto, type PurchaseDto } from "../purchases/dto";

export interface SetPurchaseStatusInput {
  id: string;
  status: "ordered" | "cancelled";
}

/**
 * The only two transitions this capability can cause: draft->ordered,
 * (draft or ordered)->cancelled. draft/ordered->received happens only
 * through receivePurchase (the first delivery), never here - matches
 * trg_purchases_guard_update's exact edge set (docs/db-design.md).
 */
export const setPurchaseStatus = defineCapability<SetPurchaseStatusInput, PurchaseDto>({
  name: "setPurchaseStatus",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.purchases.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true, status: true },
      });
      if (!existing) throw new Error("That purchase doesn't exist.");
      await assertStoreAccess(actor, existing.store_id);

      if (input.status === "ordered" && existing.status !== "draft") {
        throw new Error("Only a draft purchase can be placed as an order.");
      }
      if (input.status === "cancelled" && !["draft", "ordered"].includes(existing.status)) {
        throw new Error("A purchase that has already received stock can't be cancelled.");
      }

      const updated = await tx.purchases.update({
        where: { id: input.id },
        data: { status: input.status },
        select: PURCHASE_SELECT,
      });
      return toPurchaseDto(updated);
    });
  },
});
