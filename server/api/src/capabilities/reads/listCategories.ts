import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { CATEGORY_SELECT, toCategoryDto, type CategoryDto } from "../categories/dto";

export interface ListCategoriesInput {
  storeId: string;
}

export const listCategories = defineCapability<ListCategoriesInput, CategoryDto[]>({
  name: "listCategories",
  kind: "read",
  requiredPermission: "catalogue:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      // flat, ordered parents-before-children by name - the frontend
      // already builds the parent/subcategory tree client-side
      // (apps/admin/lib/catalogue.ts), so this doesn't nest the result
      const rows = await tx.categories.findMany({
        where: { tenant_id: actor.tenantId, store_id: input.storeId },
        orderBy: [{ parent_id: "asc" }, { name: "asc" }],
        select: CATEGORY_SELECT,
      });
      return rows.map(toCategoryDto);
    });
  },
});
