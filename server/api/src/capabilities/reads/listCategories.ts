import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { type CategoryDto } from "../categories/dto";
import { categoriesInTx } from "../lookups/queries";

export interface ListCategoriesInput {
  storeId: string;
}

export const listCategories = defineCapability<ListCategoriesInput, CategoryDto[]>({
  name: "listCategories",
  kind: "read",
  requiredPermission: "stocks:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    // flat, ordered parents-before-children by name - the frontend
    // already builds the parent/subcategory tree client-side
    // (apps/admin/lib/catalogue.ts), so this doesn't nest the result
    return runInTenantContext(actor, (tx) => categoriesInTx(tx, actor, input.storeId));
  },
});
