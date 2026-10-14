import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PURCHASE_SELECT, toPurchaseDto, type PurchaseDto } from "../purchases/dto";
import { receiveLines, type ReceiveLineInput } from "../purchases/receiveLines";

export type ReceivePurchaseLineInput = ReceiveLineInput;

export interface ReceivePurchaseInput {
  id: string;
  deliveryDate: string;
  /** Only the lines that have something arriving - see ReceiveSheet.tsx. */
  lines: ReceivePurchaseLineInput[];
}

/**
 * Records one delivery against an ordered (or already-receiving) purchase.
 * Can be called more than once per purchase - each call only has to cover
 * the lines/quantities that actually arrived this time, matching
 * ReceiveSheet.tsx exactly. "received" is set on the FIRST delivery and
 * never means "fully received" - see docs/db-design.md's own note on
 * purchases_received_at_check. Per line: one inventory_batches row, one
 * matching stock_movements row - purchase_items itself is never touched.
 */
export const receivePurchase = defineCapability<ReceivePurchaseInput, PurchaseDto>({
  name: "receivePurchase",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const purchase = await tx.purchases.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!purchase) throw new Error("That purchase doesn't exist.");
      await assertStoreAccess(actor, purchase.store_id);

      await receiveLines(tx, actor, {
        purchaseId: input.id,
        deliveryDate: input.deliveryDate,
        lines: input.lines,
      });

      const row = await tx.purchases.findUniqueOrThrow({
        where: { id: input.id },
        select: PURCHASE_SELECT,
      });
      return toPurchaseDto(row);
    });
  },
});
