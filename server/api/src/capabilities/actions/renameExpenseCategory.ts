import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import {
  EXPENSE_CATEGORY_SELECT,
  toExpenseCategoryDto,
  type ExpenseCategoryDto,
} from "../expenseCategories/dto";

export interface RenameExpenseCategoryInput {
  id: string;
  name: string;
}

export const renameExpenseCategory = defineCapability<
  RenameExpenseCategoryInput,
  ExpenseCategoryDto
>({
  name: "renameExpenseCategory",
  kind: "action",
  requiredPermission: "expenses:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Enter a name.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.expense_categories.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { is_catch_all: true },
        });
        if (!existing) throw new Error("That category doesn't exist.");
        if (existing.is_catch_all) throw new Error(`"Other" can't be renamed.`);

        const updated = await tx.expense_categories.update({
          where: { id: input.id },
          data: { name },
          select: EXPENSE_CATEGORY_SELECT,
        });
        return toExpenseCategoryDto(updated);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("This category already exists.");
      }
      throw error;
    }
  },
});
