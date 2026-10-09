import { runInTenantContext } from "../../shared/tenantContext";
import type { CapabilityActor } from "@zenzoo/types";

export interface CurrentUser {
  name: string;
  roleName: string | null;
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
        roles: { select: { name: true } },
      },
    });
    const name = membership?.users
      ? [membership.users.first_name, membership.users.last_name].filter(Boolean).join(" ")
      : "";
    return { name, roleName: membership?.roles.name ?? null };
  });
}
