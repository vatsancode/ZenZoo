import { runInTenantContext } from "../../shared/tenantContext";
import type { CapabilityActor } from "@zenzoo/types";
import { PERMISSION_AREAS, type AccessLevel } from "../../shared/permissionAreas";

export interface CurrentUser {
  name: string;
  roleName: string | null;
  /**
   * What the person's role allows in every area, so the admin can leave out the buttons and
   * pages they can't use. It only describes - the API checks the permission again on every
   * request, so this can never grant anything.
   */
  permissions: Record<string, AccessLevel>;
}

/**
 * Not a capability (no defineCapability/hasPermission here) - seeing your
 * own name and role isn't a permission-gated action, it's inherent to
 * being signed in at all. Same reasoning as users' own tenant_membership_or_self
 * RLS policy: a person can always see their own row, regardless of what
 * their role otherwise allows. Nothing here reveals anything the caller
 * doesn't already know about themself.
 */
export async function getCurrentUser(actor: CapabilityActor): Promise<CurrentUser> {
  return runInTenantContext(actor, async (tx) => {
    const membership = await tx.tenant_memberships.findFirst({
      where: { tenant_id: actor.tenantId, user_id: actor.userId, status: { not: "removed" } },
      select: {
        users: { select: { first_name: true, last_name: true } },
        roles: {
          select: { name: true, role_permissions: { select: { area: true, access_level: true } } },
        },
      },
    });
    const name = membership?.users
      ? [membership.users.first_name, membership.users.last_name].filter(Boolean).join(" ")
      : "";
    // A missing role_permissions row means "none" (docs/db-design.md).
    const granted = membership?.roles.role_permissions ?? [];
    const permissions = Object.fromEntries(
      PERMISSION_AREAS.map((area) => [
        area,
        (granted.find((row) => row.area === area)?.access_level ?? "none") as AccessLevel,
      ]),
    );
    return { name, roleName: membership?.roles.name ?? null, permissions };
  });
}
