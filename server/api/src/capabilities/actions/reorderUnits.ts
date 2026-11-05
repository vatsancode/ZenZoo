import { UserFacingError } from "../../shared/errors";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { isWholeList, sortByPlacement } from "../../shared/placement";
import { UNIT_SELECT, toUnitDto, type UnitDto } from "../units/dto";

export interface ReorderUnitsInput {
  /** Every unit's id, in the order the shop wants them shown. */
  orderedIds: string[];
}

export const reorderUnits = defineCapability<ReorderUnitsInput, UnitDto[]>({
  name: "reorderUnits",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.units.findMany({
        where: { tenant_id: actor.tenantId },
        select: { id: true },
      });
      const orderedIds = input.orderedIds;
      if (
        !isWholeList(
          orderedIds,
          existing.map((row) => row.id),
        )
      ) {
        throw new UserFacingError("The list has changed. Refresh the page and try again.");
      }

      for (const [index, id] of orderedIds.entries()) {
        await tx.units.update({ where: { id }, data: { sort_order: index + 1 } });
      }

      const rows = await tx.units.findMany({
        where: { tenant_id: actor.tenantId },
        select: UNIT_SELECT,
      });
      return sortByPlacement(rows).map(toUnitDto);
    });
  },
});
