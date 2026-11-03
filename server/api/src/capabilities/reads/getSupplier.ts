import { defineCapability, NotFoundError } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { SUPPLIER_SELECT, toSupplierDto, type SupplierDto } from "../suppliers/dto";

export interface GetSupplierInput {
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One supplier, for its detail page - so opening a vendor doesn't download every vendor.
 * Archived suppliers are still returned (their page and history stay viewable). Another shop's
 * supplier, or an id that isn't one at all, is simply not found.
 */
export const getSupplier = defineCapability<GetSupplierInput, SupplierDto>({
  name: "getSupplier",
  kind: "read",
  requiredPermission: "vendors:view",
  async handler(actor, input) {
    // Checked first: the id column is a uuid, so "abc" would otherwise fail as a database error.
    if (typeof input.id !== "string" || !UUID.test(input.id)) {
      throw new NotFoundError("That vendor doesn't exist.");
    }
    return runInTenantContext(actor, async (tx) => {
      const row = await tx.suppliers.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: SUPPLIER_SELECT,
      });
      if (!row) throw new NotFoundError("That vendor doesn't exist.");
      return toSupplierDto(row);
    });
  },
});
