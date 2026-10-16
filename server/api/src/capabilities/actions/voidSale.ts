import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { SaleDto } from "../sales/dto";
import { recordVoid, type RecordVoidInput } from "../sales/recordVoid";

export type VoidSaleInput = RecordVoidInput;

/**
 * Cancels a completed sale - see recordVoid. It is the strongest thing you can do to a sale
 * (stock goes back, money goes back out of the accounts, credit entries are reversed), so it needs
 * the delete level on Sales, not just edit.
 */
export const voidSale = defineCapability<VoidSaleInput, SaleDto>({
  name: "voidSale",
  kind: "action",
  requiredPermission: "sales:delete",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => recordVoid(tx, actor, input));
  },
});
