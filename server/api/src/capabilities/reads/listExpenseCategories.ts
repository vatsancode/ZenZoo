import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import {
  EXPENSE_CATEGORY_SELECT,
  toExpenseCategoryDto,
  type ExpenseCategoryDto,
  type ExpenseCategoryUsage,
} from "../expenseCategories/dto";

/** Tenant-wide, not store-scoped. The catch-all "Other" always comes last. */
export const listExpenseCategories = defineCapability<void, ExpenseCategoryDto[]>({
  name: "listExpenseCategories",
  kind: "read",
  requiredPermission: "expenses:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.expense_categories.findMany({
        where: { tenant_id: actor.tenantId },
        orderBy: { created_at: "asc" },
        select: EXPENSE_CATEGORY_SELECT,
      });
      const lines = await tx.expense_lines.findMany({
        where: { tenant_id: actor.tenantId },
        select: { expense_category_id: true, expense_id: true, amount: true },
      });

      const usage = new Map<string, ExpenseCategoryUsage & { billIds: Set<string> }>();
      for (const line of lines) {
        const entry = usage.get(line.expense_category_id) ?? {
          items: 0,
          bills: 0,
          spent: 0,
          billIds: new Set<string>(),
        };
        entry.items += 1;
        entry.spent += Number(line.amount);
        entry.billIds.add(line.expense_id);
        entry.bills = entry.billIds.size;
        usage.set(line.expense_category_id, entry);
      }

      const ordered = [
        ...rows.filter((row) => !row.is_catch_all),
        ...rows.filter((row) => row.is_catch_all),
      ];
      return ordered.map((row) => toExpenseCategoryDto(row, usage.get(row.id)));
    });
  },
});
