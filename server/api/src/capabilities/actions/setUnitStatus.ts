import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { UNIT_SELECT, toUnitDto, type UnitDto } from "../units/dto";

export interface SetUnitStatusInput {
  id: string;
  disabled: boolean;
}

export const setUnitStatus = defineCapability<SetUnitStatusInput, UnitDto>({
  name: "setUnitStatus",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.units.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { id: true },
      });
      if (!existing) throw new Error("That unit doesn't exist.");

      if (input.disabled) {
        const othersActive = await tx.units.count({
          where: { id: { not: input.id }, tenant_id: actor.tenantId, status: "active" },
        });
        if (othersActive === 0) throw new Error("At least one unit has to stay on.");
      }

      const updated = await tx.units.update({
        where: { id: input.id },
        data: { status: input.disabled ? "disabled" : "active" },
        select: UNIT_SELECT,
      });
      return toUnitDto(updated);
    });
  },
});
