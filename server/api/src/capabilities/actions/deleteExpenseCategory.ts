import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";

export interface DeleteExpenseCategoryInput {
  id: string;
}

export const deleteExpenseCategory = defineCapability<DeleteExpenseCategoryInput, { id: string }>({
  name: "deleteExpenseCategory",
  kind: "action",
  requiredPermission: "expenses:delete",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.expense_categories.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { is_catch_all: true },
      });
      // Already gone - deleting twice is a no-op success, same as deleteCategory.
      if (!existing) return { id: input.id };
      if (existing.is_catch_all) throw new Error(`"Other" is the catch-all and can't be deleted.`);

      // expense_lines_category_fk (ON DELETE RESTRICT) backs this up at the database level.
      const used = await tx.expense_lines.count({
        where: { tenant_id: actor.tenantId, expense_category_id: input.id },
      });
      if (used > 0) {
        throw new Error(
          `${used} ${used === 1 ? "item is" : "items are"} filed under this category. Rename it instead.`,
        );
      }

      await tx.expense_categories.delete({ where: { id: input.id } });
      return { id: input.id };
    });
  },
});
