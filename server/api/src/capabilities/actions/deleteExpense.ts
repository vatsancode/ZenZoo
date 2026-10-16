import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";

export interface DeleteExpenseInput {
  id: string;
}

/** A paid bill's money goes back into its account (trg_expenses_apply_balance); its items go with it. */
export const deleteExpense = defineCapability<DeleteExpenseInput, { id: string }>({
  name: "deleteExpense",
  kind: "action",
  requiredPermission: "expenses:delete",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.expenses.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      // Already gone - deleting twice is a no-op success.
      if (!existing) return { id: input.id };
      await assertStoreAccess(actor, existing.store_id);

      await tx.expenses.delete({ where: { id: input.id } });
      return { id: input.id };
    });
  },
});
