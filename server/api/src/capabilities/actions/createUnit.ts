import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { UNIT_SELECT, toUnitDto, type UnitDto } from "../units/dto";

export interface CreateUnitInput {
  code: string;
  name: string;
  allowDecimals: boolean;
}

const CODE_PATTERN = /^[A-Za-z0-9]+$/;

export const createUnit = defineCapability<CreateUnitInput, UnitDto>({
  name: "createUnit",
  kind: "action",
  requiredPermission: "settings:edit",
  async handler(actor, input) {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code) throw new Error("Enter a short code, like doz.");
    if (!name) throw new Error("Enter the unit's name, like Dozen.");
    if (!CODE_PATTERN.test(code)) throw new Error("A unit code can only use letters and numbers.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const clash = await tx.units.findFirst({
          where: { tenant_id: actor.tenantId, code: { equals: code, mode: "insensitive" } },
          select: { id: true },
        });
        if (clash) throw new Error("A unit with this code already exists.");

        const created = await tx.units.create({
          data: { tenant_id: actor.tenantId, code, name, allow_decimals: input.allowDecimals },
          select: UNIT_SELECT,
        });
        return toUnitDto(created);
      });
    } catch (error) {
      // units_tenant_code_unique
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("A unit with this code already exists.");
      }
      throw error;
    }
  },
});
