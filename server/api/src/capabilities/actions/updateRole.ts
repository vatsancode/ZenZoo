import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { PERMISSION_AREAS, type AccessLevel } from "../../shared/permissionAreas";
import { ROLE_SELECT, toRoleDto, type RoleDto } from "../roles/dto";

export interface UpdateRoleInput {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, AccessLevel>;
}

export const updateRole = defineCapability<UpdateRoleInput, RoleDto>({
  name: "updateRole",
  kind: "action",
  requiredPermission: "users:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Give the role a name.");

    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.roles.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { is_owner_role: true },
      });
      if (!existing) throw new Error("That role no longer exists.");
      // trg_fn_roles_protect_owner_role / trg_fn_role_permissions_protect_owner_role
      // (docs/db-design.md) would reject this anyway - checked here first for a
      // message that reads like the rest of this capability's errors, not a
      // raw Postgres exception.
      if (existing.is_owner_role) throw new Error("The Owner role can't be changed.");

      try {
        await tx.roles.update({
          where: { id: input.id },
          data: { name, description: input.description.trim() },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new Error("There is already a role with that name.");
        }
        throw error;
      }

      // A role edit rewrites the whole grid at once (see role_permissions'
      // own "no updated_at" note) - delete and recreate rather than
      // upserting each of the eleven areas individually.
      await tx.role_permissions.deleteMany({ where: { role_id: input.id } });
      await tx.role_permissions.createMany({
        data: PERMISSION_AREAS.map((area) => ({
          role_id: input.id,
          tenant_id: actor.tenantId,
          area,
          access_level: input.permissions[area] ?? "none",
        })),
      });

      const row = await tx.roles.findUniqueOrThrow({
        where: { id: input.id },
        select: ROLE_SELECT,
      });
      return toRoleDto(row);
    });
  },
});
