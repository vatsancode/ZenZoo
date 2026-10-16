import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { EXPENSE_SELECT, toExpenseDto, type ExpenseDto } from "../expenses/dto";
import { cleanExpense, friendlyExpenseError, type ExpenseInput } from "../expenses/input";

export interface CreateExpenseInput extends ExpenseInput {
  storeId: string;
}

/**
 * A paid bill takes its total out of the account in the same statement
 * (trg_expenses_apply_balance); a pending one moves no money until it is paid.
 */
export const createExpense = defineCapability<CreateExpenseInput, ExpenseDto>({
  name: "createExpense",
  kind: "action",
  requiredPermission: "expenses:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    const bill = cleanExpense(input);

    try {
      return await runInTenantContext(actor, async (tx) => {
        const created = await tx.expenses.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            expense_date: bill.date,
            payee: bill.payee,
            reference: bill.reference,
            note: bill.note,
            status: bill.status,
            due_date: bill.dueDate,
            paid_date: bill.paidDate,
            payment_account_id: bill.accountId,
            total: bill.total,
            created_by: actor.userId,
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
        return toExpenseDto(created);
      });
    } catch (error) {
      throw friendlyExpenseError(error);
    }
  },
});
