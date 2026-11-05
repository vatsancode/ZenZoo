import { z } from "zod";
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
  description:
    "List the expenses (bills) at one store, newest first. Each has its date, payee, reference, note, status (pending means to be paid later, paid means money has left an account), due date, paid date, the account it was paid from, its total and its lines. Get storeId from listStores. Money amounts are decimal text in rupees.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
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
