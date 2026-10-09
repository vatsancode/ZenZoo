import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface SetProductStatusInput {
  id: string;
  archived: boolean;
}

/**
 * sellables.status is a freely reversible catalogue toggle, never a delete
 * - archiving blocks new sale_items on every one of its variants without
 * touching a single variant row (no cascade, by design - see
 * docs/db-design.md's "Sellable-archived and variant-deactivated combine
 * with AND" note).
 */
export const setProductStatus = defineCapability<SetProductStatusInput, ProductDto>({
  name: "setProductStatus",
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

      const updated = await tx.sellables.update({
        where: { id: input.id },
        data: { status: input.archived ? "archived" : "active" },
        select: PRODUCT_SELECT,
      });
      return toProductDto(updated);
    });
  },
});
