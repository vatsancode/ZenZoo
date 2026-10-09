import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { SUPPLIER_SELECT, toSupplierDto, type SupplierDto } from "../suppliers/dto";

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
    const name = input.name.trim();
    if (!name) throw new Error("Give the supplier a name.");

    return runInTenantContext(actor, async (tx) => {
      const created = await tx.suppliers.create({
        data: {
          tenant_id: actor.tenantId,
          name,
          phone: blankToNull(input.phone),
          // suppliers_email_lowercase_check
          email: blankToNull(input.email)?.toLowerCase() ?? null,
          tax_id: blankToNull(input.taxId)?.toUpperCase() ?? null,
          map_url: blankToNull(input.mapUrl),
        },
        select: SUPPLIER_SELECT,
      });
      return toSupplierDto(created);
    });
  },
});
