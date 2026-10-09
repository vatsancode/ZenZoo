import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { SUPPLIER_SELECT, toSupplierDto, type SupplierDto } from "../suppliers/dto";

export interface UpdateSupplierInput {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  taxId?: string;
  mapUrl?: string;
}

const blankToNull = (value?: string) => value?.trim() || null;

export const updateSupplier = defineCapability<UpdateSupplierInput, SupplierDto>({
  name: "updateSupplier",
  kind: "action",
  requiredPermission: "vendors:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Give the supplier a name.");

    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.suppliers.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { id: true },
      });
      if (!existing) throw new Error("That supplier doesn't exist.");

      const updated = await tx.suppliers.update({
        where: { id: input.id },
        data: {
          name,
          phone: blankToNull(input.phone),
          email: blankToNull(input.email)?.toLowerCase() ?? null,
          tax_id: blankToNull(input.taxId)?.toUpperCase() ?? null,
          map_url: blankToNull(input.mapUrl),
        },
        select: SUPPLIER_SELECT,
      });
      return toSupplierDto(updated);
    });
  },
});
