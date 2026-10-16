import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import {
  EXPENSE_CATEGORY_SELECT,
  toExpenseCategoryDto,
  type ExpenseCategoryDto,
} from "../expenseCategories/dto";

export interface CreateExpenseCategoryInput {
  name: string;
}

export const createExpenseCategory = defineCapability<
  CreateExpenseCategoryInput,
  ExpenseCategoryDto
>({
  name: "createExpenseCategory",
  kind: "action",
  requiredPermission: "expenses:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Enter a name.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const created = await tx.expense_categories.create({
          data: { tenant_id: actor.tenantId, name },
          select: EXPENSE_CATEGORY_SELECT,
        });
        return toExpenseCategoryDto(created);
      });
    } catch (error) {
      // expense_categories_tenant_name_unique (case-insensitive)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("This category already exists.");
      }
      throw error;
    }
  },
});
