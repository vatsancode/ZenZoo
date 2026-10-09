import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { CATEGORY_SELECT, toCategoryDto, type CategoryDto } from "../categories/dto";

export interface RenameCategoryInput {
  id: string;
  name: string;
}

export const renameCategory = defineCapability<RenameCategoryInput, CategoryDto>({
  name: "renameCategory",
  kind: "action",
  requiredPermission: "catalogue:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Give the category a name.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.categories.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { id: true, store_id: true },
        });
        if (!existing) throw new Error("That category doesn't exist.");
        await assertStoreAccess(actor, existing.store_id);

        const updated = await tx.categories.update({
          where: { id: input.id },
          data: { name },
          select: CATEGORY_SELECT,
        });
        return toCategoryDto(updated);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("There is already a category with that name.");
      }
      throw error;
    }
  },
});
