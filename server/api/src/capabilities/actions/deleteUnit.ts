import { UserFacingError } from "../../shared/errors";
import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";

export interface DeleteUnitInput {
  id: string;
}

export const deleteUnit = defineCapability<DeleteUnitInput, { id: string }>({
  name: "deleteUnit",
  kind: "action",
  requiredPermission: "settings:delete",
  async handler(actor, input) {
    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.units.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { name: true, system_key: true },
        });
        // Already gone - deleting twice is a no-op success, like deleteCategory.
        if (!existing) return { id: input.id };

        // The unit every product can fall back on - it can be switched off but never deleted.
        if (existing.system_key === "pieces") {
          throw new UserFacingError(`${existing.name} is built in and can't be deleted.`);
        }

        const productCount = await tx.variants.count({
          where: { tenant_id: actor.tenantId, unit_id: input.id },
        });
        if (productCount > 0) {
          throw new UserFacingError(
            `${existing.name} is used by ${productCount} product${productCount === 1 ? "" : "s"}. Switch it off instead.`,
          );
        }

        await tx.units.delete({ where: { id: input.id } });
        return { id: input.id };
      });
    } catch (error) {
      // variants_unit_fk: a product took the unit between the count and the delete.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new UserFacingError("A product is using this unit now. Switch it off instead.");
      }
      throw error;
    }
  },
});
