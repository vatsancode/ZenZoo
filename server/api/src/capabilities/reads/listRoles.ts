import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { ROLE_SELECT, toRoleDto, type RoleDto } from "../roles/dto";

export const listRoles = defineCapability<void, RoleDto[]>({
  name: "listRoles",
  kind: "read",
  requiredPermission: "users:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.roles.findMany({
        where: { tenant_id: actor.tenantId },
        orderBy: [{ is_owner_role: "desc" }, { name: "asc" }],
        select: ROLE_SELECT,
      });
      return rows.map(toRoleDto);
    });
  },
});
