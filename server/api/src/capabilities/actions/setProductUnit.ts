import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface SetProductUnitInput {
  id: string;
  unitId: string;
}

/**
 * Every variant under a product shares one unit - createVariant inherits it
 * from a sibling, and a variant can no longer change its own (see
 * updateVariant). This is the one place a product's unit actually changes,
 * and it changes it everywhere at once: one bulk write across every variant
 * of the sellable, not a loop.
 */
export const setProductUnit = defineCapability<SetProductUnitInput, ProductDto>({
  name: "setProductUnit",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.sellables.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!existing) throw new Error("That product doesn't exist.");
      await assertStoreAccess(actor, existing.store_id);

      const unit = await tx.units.findFirst({
        where: { id: input.unitId, tenant_id: actor.tenantId, status: "active" },
        select: { id: true },
      });
      if (!unit) throw new Error("Choose a unit.");

      await tx.variants.updateMany({
        where: { sellable_id: input.id, tenant_id: actor.tenantId },
        data: { unit_id: input.unitId },
      });

      const row = await tx.sellables.findUniqueOrThrow({
        where: { id: input.id },
        select: PRODUCT_SELECT,
      });
      return toProductDto(row);
    });
  },
});
