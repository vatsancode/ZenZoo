import { UserFacingError } from "../../shared/errors";
import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { assertFits, cleanName } from "../../shared/names";
import { CATEGORY_SELECT, toCategoryDto, type CategoryDto } from "../categories/dto";

export interface RenameCategoryInput {
  id: string;
  name: string;
}

export const renameCategory = defineCapability<RenameCategoryInput, CategoryDto>({
  name: "renameCategory",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    const name = cleanName(input.name);
    if (!name) throw new UserFacingError("Give the category a name.");
    assertFits(name, 100, "The category name");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.categories.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { id: true, store_id: true },
        });
        if (!existing) throw new UserFacingError("That category doesn't exist.");
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
        throw new UserFacingError("There is already a category with that name.");
      }
      throw error;
    }
  },
});
