import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { CATEGORY_SELECT, toCategoryDto, type CategoryDto } from "../categories/dto";

export interface CreateCategoryInput {
  storeId: string;
  name: string;
  /** Omit for a top-level category; set to make this a subcategory. */
  parentId?: string;
}

export const createCategory = defineCapability<CreateCategoryInput, CategoryDto>({
  name: "createCategory",
  kind: "action",
  requiredPermission: "catalogue:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    const name = input.name.trim();
    if (!name) throw new Error("Give the category a name.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        if (input.parentId) {
          // one level deep - trg_categories_one_level_deep is the backstop,
          // this is the friendly version of the same rule
          const parent = await tx.categories.findFirst({
            where: { id: input.parentId, tenant_id: actor.tenantId, store_id: input.storeId },
            select: { parent_id: true },
          });
          if (!parent) throw new Error("That parent category doesn't exist.");
          if (parent.parent_id) {
            throw new Error("A subcategory can't have its own subcategories.");
          }
        }

        const created = await tx.categories.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            name,
            parent_id: input.parentId ?? null,
          },
          select: CATEGORY_SELECT,
        });
        return toCategoryDto(created);
      });
    } catch (error) {
      // idx_categories_top_level_name_unique / idx_categories_subcategory_name_unique
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("There is already a category with that name.");
      }
      throw error;
    }
  },
});
