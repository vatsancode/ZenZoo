import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { EXPENSE_SELECT, toExpenseDto, type ExpenseDto } from "../expenses/dto";

export interface ListExpensesInput {
  storeId: string;
}

export const listExpenses = defineCapability<ListExpensesInput, ExpenseDto[]>({
  name: "listExpenses",
  kind: "read",
  requiredPermission: "expenses:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.expenses.findMany({
        where: { tenant_id: actor.tenantId, store_id: input.storeId },
        orderBy: [{ expense_date: "desc" }, { created_at: "desc" }],
        select: EXPENSE_SELECT,
      });
      return rows.map(toExpenseDto);
    });
  },
});
