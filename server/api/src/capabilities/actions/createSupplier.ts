import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { SUPPLIER_SELECT, toSupplierDto, type SupplierDto } from "../suppliers/dto";
import { assertTaxIdFree } from "../suppliers/taxId";
import { assertSupplierFields } from "../suppliers/validate";

export interface CreateSupplierInput {
  name: string;
  phone?: string;
  email?: string;
  taxId?: string;
  mapUrl?: string;
}

const blankToNull = (value?: string) => value?.trim() || null;

export const createSupplier = defineCapability<CreateSupplierInput, SupplierDto>({
  name: "createSupplier",
  kind: "action",
  requiredPermission: "vendors:edit",
  async handler(actor, input) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      throw new Error("Give the supplier a name.");
    }
    assertSupplierFields(input);
    const name = input.name.trim();

    const taxId = blankToNull(input.taxId)?.toUpperCase() ?? null;

    return runInTenantContext(actor, async (tx) => {
      await assertTaxIdFree(tx, actor.tenantId, taxId);
      const created = await tx.suppliers.create({
        data: {
          tenant_id: actor.tenantId,
          name,
          phone: blankToNull(input.phone),
          // suppliers_email_lowercase_check
          email: blankToNull(input.email)?.toLowerCase() ?? null,
          tax_id: taxId,
          map_url: blankToNull(input.mapUrl),
        },
        select: SUPPLIER_SELECT,
      });
      return toSupplierDto(created);
    });
  },
});
