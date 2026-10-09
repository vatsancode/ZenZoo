import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { SUPPLIER_SELECT, toSupplierDto, type SupplierDto } from "../suppliers/dto";

export interface SetSupplierStatusInput {
  id: string;
  archived: boolean;
}

/** suppliers.status: archive/reactivate. Never a delete - a supplier's purchase history (F-26, suppliers_tenant_id_id_unique) outlives it. */
export const setSupplierStatus = defineCapability<SetSupplierStatusInput, SupplierDto>({
  name: "setSupplierStatus",
  kind: "action",
  requiredPermission: "vendors:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.suppliers.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { id: true },
      });
      if (!existing) throw new Error("That supplier doesn't exist.");

      const updated = await tx.suppliers.update({
        where: { id: input.id },
        data: { status: input.archived ? "archived" : "active" },
        select: SUPPLIER_SELECT,
      });
      return toSupplierDto(updated);
    });
  },
});
