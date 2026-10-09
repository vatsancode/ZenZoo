import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { PERMISSION_AREAS, type AccessLevel } from "../../shared/permissionAreas";
import { ROLE_SELECT, toRoleDto, type RoleDto } from "../roles/dto";

export interface CreateRoleInput {
  name: string;
  description: string;
  permissions: Record<string, AccessLevel>;
}

export const createRole = defineCapability<CreateRoleInput, RoleDto>({
  name: "createRole",
  kind: "action",
  requiredPermission: "users:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Give the role a name.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        // Two steps, not a nested create: role_permissions' composite FK
        // (tenant_id, role_id) isn't something Prisma's nested-write shape
        // can populate from the roles relation alone - it only infers the
        // single role_id scalar, not the tenant_id column the FK also
        // covers, and rejects tenant_id as an unknown nested-create field.
        const created = await tx.roles.create({
          data: { tenant_id: actor.tenantId, name, description: input.description.trim() },
          select: { id: true },
        });
        await tx.role_permissions.createMany({
          data: PERMISSION_AREAS.map((area) => ({
            role_id: created.id,
            tenant_id: actor.tenantId,
            area,
            access_level: input.permissions[area] ?? "none",
          })),
        });
        const row = await tx.roles.findUniqueOrThrow({
          where: { id: created.id },
          select: ROLE_SELECT,
        });
        return toRoleDto(row);
      });
    } catch (error) {
      // roles_name_unique - see roles' own notes in docs/db-design.md
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("There is already a role with that name.");
      }
      throw error;
    }
  },
});
