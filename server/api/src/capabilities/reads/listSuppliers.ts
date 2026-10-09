import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { SUPPLIER_SELECT, toSupplierDto, type SupplierDto } from "../suppliers/dto";

/** Tenant-wide, not store-scoped - suppliers has no store_id at all ("one supplier can serve any store"). */
export const listSuppliers = defineCapability<void, SupplierDto[]>({
  name: "listSuppliers",
  kind: "read",
  requiredPermission: "vendors:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      // newest first - matches the admin UI's prior mock behavior of
      // prepending a new vendor to the top of the list
      const rows = await tx.suppliers.findMany({
        where: { tenant_id: actor.tenantId },
        orderBy: { created_at: "desc" },
        select: SUPPLIER_SELECT,
      });
      return rows.map(toSupplierDto);
    });
  },
});
