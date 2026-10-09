import { runInTenantContext } from "./tenantContext";
import type { CapabilityActor } from "@zenzoo/types";

export class StoreAccessError extends Error {}

/**
 * Confirms the actor may act within `storeId`, per membership_store_access's
 * own rule (docs/db-design.md): a membership with zero rows there has
 * access to every store in the tenant; one with rows is narrowed to exactly
 * those stores. Every store-scoped capability (categories, and whatever
 * follows it) calls this before touching the store's data - there is no
 * CapabilityActor.storeId, so this is re-checked per request rather than
 * trusted from a session once.
 */
export async function assertStoreAccess(actor: CapabilityActor, storeId: string): Promise<void> {
  await runInTenantContext(actor, async (tx) => {
    const store = await tx.stores.findFirst({
      where: { tenant_id: actor.tenantId, id: storeId },
      select: { id: true },
    });
    if (!store) throw new StoreAccessError("That store doesn't exist.");

    const membership = await tx.tenant_memberships.findFirst({
      where: { tenant_id: actor.tenantId, user_id: actor.userId, status: "active" },
      select: { id: true },
    });
    if (!membership) throw new StoreAccessError("No active membership for this tenant.");

    const restrictionCount = await tx.membership_store_access.count({
      where: { tenant_id: actor.tenantId, membership_id: membership.id },
    });
    if (restrictionCount === 0) return;

    const allowed = await tx.membership_store_access.findFirst({
      where: { tenant_id: actor.tenantId, membership_id: membership.id, store_id: storeId },
      select: { id: true },
    });
    if (!allowed) throw new StoreAccessError("You don't have access to that store.");
  });
}
