import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface SetVariantStatusInput {
  id: string;
  deactivated: boolean;
}

/** variants.status - deactivating one variant never touches its sibling variants or the parent sellable's status. */
export const setVariantStatus = defineCapability<SetVariantStatusInput, ProductDto>({
  name: "setVariantStatus",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.variants.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true, sellable_id: true },
      });
      if (!existing) throw new Error("That variant doesn't exist.");
      await assertStoreAccess(actor, existing.store_id);

      await tx.variants.update({
        where: { id: input.id },
        data: { status: input.deactivated ? "deactivated" : "active" },
      });

      const row = await tx.sellables.findUniqueOrThrow({
        where: { id: existing.sellable_id },
        select: PRODUCT_SELECT,
      });
      return toProductDto(row);
    });
  },
});
