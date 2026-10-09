import { runInTenantContext } from "../../shared/tenantContext";
import type { CapabilityActor } from "@zenzoo/types";

export interface MyStoreDto {
  id: string;
  name: string;
  code: string;
}

/**
 * Not a capability, same reasoning as getCurrentUser: which of your own
 * tenant's stores you may act in is inherent to your own membership (see
 * shared/storeAccess.ts for the membership_store_access rule this mirrors),
 * not a separately permission-gated resource. This is what the frontend's
 * store switcher calls to populate its options.
 */
export async function listMyStores(actor: CapabilityActor): Promise<MyStoreDto[]> {
  return runInTenantContext(actor, async (tx) => {
    const membership = await tx.tenant_memberships.findFirst({
      where: { tenant_id: actor.tenantId, user_id: actor.userId, status: "active" },
      select: { id: true },
    });
    if (!membership) return [];

    const restrictions = await tx.membership_store_access.findMany({
      where: { tenant_id: actor.tenantId, membership_id: membership.id },
      select: { store_id: true },
    });

    const rows = await tx.stores.findMany({
      where: {
        tenant_id: actor.tenantId,
        status: "active",
        ...(restrictions.length > 0
          ? { id: { in: restrictions.map((r) => r.store_id) } }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    });

    return rows.map((row) => ({ id: row.id, name: row.name, code: row.code }));
  });
}
