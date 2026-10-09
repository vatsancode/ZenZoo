import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface ListProductsInput {
  storeId: string;
}

export const listProducts = defineCapability<ListProductsInput, ProductDto[]>({
  name: "listProducts",
  kind: "read",
  requiredPermission: "stocks:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.sellables.findMany({
        where: { tenant_id: actor.tenantId, store_id: input.storeId, kind: "product" },
        orderBy: { name: "asc" },
        select: PRODUCT_SELECT,
      });
      return rows.map(toProductDto);
    });
  },
});
