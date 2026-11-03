import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { MEMBERSHIP_SELECT, toUserDto, type UserDto } from "../users/dto";
import { getOwnerUserId } from "../users/ownerRules";

export const listUsers = defineCapability<void, UserDto[]>({
  name: "listUsers",
  kind: "read",
  requiredPermission: "users:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.tenant_memberships.findMany({
        where: { tenant_id: actor.tenantId, status: { in: ["active", "suspended"] } },
        orderBy: { created_at: "asc" },
        select: MEMBERSHIP_SELECT,
      });
      const ownerUserId = await getOwnerUserId(tx, actor.tenantId);
      return rows.map((row) => toUserDto(row, actor.userId, ownerUserId));
    });
  },
});
