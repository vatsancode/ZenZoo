import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { EXPENSE_SELECT, toExpenseDto, type ExpenseDto } from "../expenses/dto";
import { cleanExpense, friendlyExpenseError, type ExpenseInput } from "../expenses/input";

export interface UpdateExpenseInput extends ExpenseInput {
  id: string;
}

/**
 * Replaces the bill's details and items. The balance trigger takes back what
 * the old version had paid and pays what the new one says, so editing a total,
 * switching account, paying a pending bill or putting a paid one back to
 * pending all leave the accounts right.
 */
export const updateExpense = defineCapability<UpdateExpenseInput, ExpenseDto>({
  name: "updateExpense",
  kind: "action",
  requiredPermission: "expenses:edit",
  async handler(actor, input) {
    const bill = cleanExpense(input);

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.expenses.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { store_id: true },
        });
        if (!existing) throw new Error("That expense doesn't exist.");
        await assertStoreAccess(actor, existing.store_id);

        await tx.expense_lines.deleteMany({
          where: { tenant_id: actor.tenantId, expense_id: input.id },
        });
        const updated = await tx.expenses.update({
          where: { id: input.id },
          data: {
            expense_date: bill.date,
            payee: bill.payee,
            reference: bill.reference,
            note: bill.note,
            status: bill.status,
            due_date: bill.dueDate,
            paid_date: bill.paidDate,
            payment_account_id: bill.accountId,
            total: bill.total,
            expense_lines: {
              create: bill.lines.map((line, position) => ({
                position,
                description: line.description,
                expense_category_id: line.categoryId,
                amount: line.amount,
              })),
            },
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
