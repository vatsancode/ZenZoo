import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { EXPENSE_SELECT, toExpenseDto, type ExpenseDto } from "../expenses/dto";
import { friendlyExpenseError } from "../expenses/input";

export interface PayExpenseInput {
  id: string;
  accountId: string;
  /** The day it was paid, YYYY-MM-DD. */
  paidDate: string;
}

/** Settles a pending bill: the account it is paid from loses the bill's total. */
export const payExpense = defineCapability<PayExpenseInput, ExpenseDto>({
  name: "payExpense",
  kind: "action",
  requiredPermission: "expenses:edit",
  async handler(actor, input) {
    if (!input.accountId) throw new Error("Choose the account it was paid from.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidDate ?? "")) {
      throw new Error("Choose the date it was paid.");
    }

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.expenses.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { store_id: true, status: true },
        });
        if (!existing) throw new Error("That expense doesn't exist.");
        await assertStoreAccess(actor, existing.store_id);
        if (existing.status === "paid") throw new Error("This bill is already paid.");

        const updated = await tx.expenses.update({
          where: { id: input.id },
          data: {
            status: "paid",
            payment_account_id: input.accountId,
            paid_date: new Date(input.paidDate),
            due_date: null,
          },
          select: EXPENSE_SELECT,
        });
        return toExpenseDto(updated);
      });
    } catch (error) {
      throw friendlyExpenseError(error);
    }
  },
});
