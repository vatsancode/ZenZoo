import { UserFacingError } from "../../shared/errors";
import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertFits, cleanName } from "../../shared/names";
import { UNIT_SELECT, toUnitDto, type UnitDto } from "../units/dto";

export interface UpdateUnitInput {
  id: string;
  name: string;
  code: string;
}

const CODE_PATTERN = /^[A-Za-z0-9]+$/;

/**
 * Changes a unit's name and short code. Products point at a unit by id, not by code, so a new
 * code follows them everywhere. The code only has to stay unique across the shop's units.
 */
export const updateUnit = defineCapability<UpdateUnitInput, UnitDto>({
  name: "updateUnit",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    const code = input.code.trim();
    const name = cleanName(input.name);
    if (!code) throw new UserFacingError("Enter a short code, like doz.");
    if (!name) throw new UserFacingError("Enter the unit's name, like Dozen.");
    if (!CODE_PATTERN.test(code))
      throw new UserFacingError("A unit code can only use letters and numbers.");
    assertFits(code, 10, "The short code");
    assertFits(name, 100, "The unit name");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.units.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { id: true },
        });
        if (!existing) throw new UserFacingError("That unit doesn't exist.");

        const clash = await tx.units.findFirst({
          where: {
            tenant_id: actor.tenantId,
            id: { not: input.id },
            code: { equals: code, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (clash) throw new UserFacingError("A unit with this code already exists.");

        const updated = await tx.units.update({
          where: { id: input.id },
          data: { name, code },
          select: UNIT_SELECT,
        });
        return toUnitDto(updated);
      });
    } catch (error) {
      // units_tenant_code_unique
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new UserFacingError("A unit with this code already exists.");
      }
      throw error;
    }
  },
});
