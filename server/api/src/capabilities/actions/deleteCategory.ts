import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";

export interface DeleteCategoryInput {
  id: string;
}

export const deleteCategory = defineCapability<DeleteCategoryInput, { id: string }>({
  name: "deleteCategory",
  kind: "action",
  requiredPermission: "catalogue:delete",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.categories.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      // Already gone - deleting twice is a no-op success (matches the admin
      // UI's prior mock behavior for this same case, see deleteRole).
      if (!existing) return { id: input.id };
      await assertStoreAccess(actor, existing.store_id);

      // categories_parent_fk cascades, so deleting this row also deletes its
      // subcategories - a product on any of THEM would otherwise hit
      // sellables_category_fk as a raw FK error mid-cascade, so they're
      // counted here too, not just products on this row directly.
      const children = await tx.categories.findMany({
        where: { parent_id: input.id },
        select: { id: true },
      });
      const productCount = await tx.sellables.count({
        where: { category_id: { in: [input.id, ...children.map((c) => c.id)] } },
      });
      if (productCount > 0) {
        throw new Error(
          `${productCount} product${productCount === 1 ? "" : "s"} ${productCount === 1 ? "is" : "are"} in this category or its subcategories. Move ${productCount === 1 ? "it" : "them"} first.`,
        );
      }

      // sellables_category_fk (ON DELETE RESTRICT) backs the check above at
      // the database level too; categories_parent_fk (ON DELETE CASCADE)
      // removes the subcategories counted above in the same statement.
      await tx.categories.delete({ where: { id: input.id } });
      return { id: input.id };
    });
  },
});
