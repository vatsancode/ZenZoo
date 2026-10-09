import type { Permission } from "../capabilities/capability";
import type { CapabilityActor } from "@zenzoo/types";
import type { Request } from "express";
import { runInTenantContext } from "../shared/tenantContext";
import { ACCESS_LEVEL_RANK, type AccessLevel } from "../shared/permissionAreas";

export type { CapabilityActor };

/**
 * Extracts the actor from an already-authenticated request. Throws rather
 * than returning null/undefined for an unauthenticated request, so a route
 * can never accidentally proceed with no actor. Populated by
 * requireTenantUser (see ./requireTenantUser.ts) for every tenant-scoped
 * route.
 */
export function getActor(req: Request): CapabilityActor {
  const actor = (req as Request & { actor?: CapabilityActor }).actor;
  if (!actor) {
    throw new Error("No authenticated actor on request - auth middleware has not run yet");
  }
  return actor;
}

/**
 * A required permission is "<area>:<level>" - e.g. "users:edit" - using the
 * exact same areas/levels as role_permissions (see docs/db-design.md) and
 * the admin UI's permission grid (apps/admin/features/settings/users.ts's
 * PERMISSION_AREAS/ACCESS_LEVELS). "At least this level" - "users:edit" is
 * satisfied by a role holding either "edit" or "delete" on "users".
 */
function parsePermission(permission: Permission): { area: string; level: AccessLevel } {
  const [area, level] = permission.split(":");
  if (!area || !level || !(level in ACCESS_LEVEL_RANK)) {
    throw new Error(`Malformed permission: "${permission}" - expected "<area>:<level>"`);
  }
  return { area, level: level as AccessLevel };
}

/**
 * Looks up whether an actor holds a given permission, by resolving their
 * active tenant_memberships row to its role_id, then that role's
 * role_permissions row for the required area - re-read from the database on
 * every call, never cached on the actor or embedded in a session token, so
 * a permission change takes effect on an actor's very next request rather
 * than waiting for their session to expire (see
 * find_login_credentials()'s own migration note on why the session no
 * longer carries a role at all).
 */
export async function hasPermission(
  actor: CapabilityActor,
  permission: Permission,
): Promise<boolean> {
  const { area, level } = parsePermission(permission);
  const requiredRank = ACCESS_LEVEL_RANK[level];

  const grant = await runInTenantContext(actor, async (tx) => {
    const membership = await tx.tenant_memberships.findFirst({
      where: { tenant_id: actor.tenantId, user_id: actor.userId, status: "active" },
      select: {
        roles: {
          select: {
            role_permissions: { where: { area }, select: { access_level: true } },
          },
        },
      },
    });
    return (membership?.roles.role_permissions[0]?.access_level ?? "none") as AccessLevel;
  });

  return ACCESS_LEVEL_RANK[grant] >= requiredRank;
}
