import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { sortByPlacement } from "../../shared/placement";
import { UNIT_SELECT, toUnitDto, type UnitDto } from "../units/dto";

/** Forgets the shop's hand-made order, so units go back to A-Z. */
export const resetUnitOrder = defineCapability<void, UnitDto[]>({
  name: "resetUnitOrder",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      await tx.units.updateMany({
        where: { tenant_id: actor.tenantId },
        data: { sort_order: null },
      });
      const rows = await tx.units.findMany({
        where: { tenant_id: actor.tenantId },
        select: UNIT_SELECT,
      });
      return sortByPlacement(rows).map(toUnitDto);
    });
  },
});
