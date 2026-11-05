import { UserFacingError } from "../../shared/errors";
import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertFits, cleanName } from "../../shared/names";
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
    const name = cleanName(input.name);
    if (!name) throw new UserFacingError("Enter a name.");
    assertFits(name, 100, "The category name");

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
        throw new UserFacingError("This category already exists.");
      }
      throw error;
    }
  },
});
