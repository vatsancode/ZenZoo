import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { UNIT_SELECT, toUnitDto, type UnitDto } from "../units/dto";

/** Tenant-wide, not store-scoped - a business's units don't vary by store. */
export const listUnits = defineCapability<void, UnitDto[]>({
  name: "listUnits",
  kind: "read",
  requiredPermission: "stocks:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.units.findMany({
        where: { tenant_id: actor.tenantId },
        orderBy: { created_at: "asc" },
        select: UNIT_SELECT,
      });
      return rows.map(toUnitDto);
    });
  },
});
