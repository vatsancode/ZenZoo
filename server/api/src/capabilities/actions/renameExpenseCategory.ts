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
    const name = cleanName(input.name);
    if (!name) throw new UserFacingError("Enter a name.");
    assertFits(name, 100, "The category name");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.expense_categories.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { is_catch_all: true },
        });
        if (!existing) throw new UserFacingError("That category doesn't exist.");
        if (existing.is_catch_all) throw new UserFacingError(`"Other" can't be renamed.`);

        const updated = await tx.expense_categories.update({
          where: { id: input.id },
          data: { name },
          select: EXPENSE_CATEGORY_SELECT,
        });
        return toExpenseCategoryDto(updated);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new UserFacingError("This category already exists.");
      }
      throw error;
    }
  },
});
