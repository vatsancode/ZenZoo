import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface UpdateProductInput {
  id: string;
  name: string;
  /** null clears the category; omit to leave it unchanged is not supported - always send the full intended value. */
  categoryId: string | null;
}

/**
 * Sellable-level fields only - name and category. `kind` is immutable
 * (trg_sellables_prevent_identity_change) and `status` is its own
 * capability (archiveProduct) since it's a distinct, guarded action, not an
 * ordinary field edit. Variants are never touched here - see
 * createVariant/updateVariant.
 */
export const updateProduct = defineCapability<UpdateProductInput, ProductDto>({
  name: "updateProduct",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Give the product a name.");

    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.sellables.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!existing) throw new Error("That product doesn't exist.");
      await assertStoreAccess(actor, existing.store_id);

      if (input.categoryId) {
        const category = await tx.categories.findFirst({
          where: { id: input.categoryId, tenant_id: actor.tenantId, store_id: existing.store_id },
          select: { id: true },
        });
        if (!category) throw new Error("That category doesn't exist.");
      }

      const updated = await tx.sellables.update({
        where: { id: input.id },
        data: { name, category_id: input.categoryId },
        select: PRODUCT_SELECT,
      });
      return toProductDto(updated);
    });
  },
});
