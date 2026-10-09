import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";

export interface DeleteRoleInput {
  id: string;
}

export const deleteRole = defineCapability<DeleteRoleInput, { id: string }>({
  name: "deleteRole",
  kind: "action",
  requiredPermission: "users:delete",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const existing = await tx.roles.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: { is_owner_role: true },
      });
      // Already gone - deleting twice is a no-op success, not an error (matches
      // the admin UI's prior mock behavior for this same case).
      if (!existing) return { id: input.id };

      if (existing.is_owner_role) throw new Error("The Owner role can't be removed.");

      const holders = await tx.tenant_memberships.count({
        where: { tenant_id: actor.tenantId, role_id: input.id, status: { not: "removed" } },
      });
      if (holders > 0) {
        throw new Error(
          `${holders} ${holders === 1 ? "person has" : "people have"} this role. Give them another role first.`,
        );
      }

      // role_permissions_role_fk's ON DELETE CASCADE (docs/db-design.md)
      // cleans up the eleven permission rows in the same statement.
      await tx.roles.delete({ where: { id: input.id } });
      return { id: input.id };
    });
  },
});
