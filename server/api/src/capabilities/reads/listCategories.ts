import { z } from "zod";
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
  description:
    "List the product categories at one store as a flat list, parents before their subcategories, each with its id, name and parentId (null for a top-level category). The category ids match the categoryId on products and catalogue items. Get storeId from listStores.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
  }),
  requiredPermission: "stocks:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    // flat, ordered parents-before-children by name - the frontend
    // already builds the parent/subcategory tree client-side
    // (apps/admin/lib/catalogue.ts), so this doesn't nest the result
    return runInTenantContext(actor, (tx) => categoriesInTx(tx, actor, input.storeId));
  },
});
