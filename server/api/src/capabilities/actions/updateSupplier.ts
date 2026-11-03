import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { SUPPLIER_SELECT, toSupplierDto, type SupplierDto } from "../suppliers/dto";
import { assertTaxIdFree } from "../suppliers/taxId";
import { assertSupplierFields } from "../suppliers/validate";

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
    if (typeof input.name !== "string" || !input.name.trim()) {
      throw new Error("Give the supplier a name.");
    }
    assertSupplierFields(input);
    const name = input.name.trim();

    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.suppliers.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { id: true },
      });
      if (!existing) throw new Error("That supplier doesn't exist.");

      const taxId = blankToNull(input.taxId)?.toUpperCase() ?? null;
      await assertTaxIdFree(tx, actor.tenantId, taxId, input.id);

      const updated = await tx.suppliers.update({
        where: { id: input.id },
        data: {
          name,
          phone: blankToNull(input.phone),
          email: blankToNull(input.email)?.toLowerCase() ?? null,
          tax_id: taxId,
          map_url: blankToNull(input.mapUrl),
        },
        select: SUPPLIER_SELECT,
      });
      return toSupplierDto(updated);
    });
  },
});
