import type { TenantTx } from "../../shared/tenantContext";

/** The user recorded as this tenant's one owner (tenants.owner_user_id). */
export async function getOwnerUserId(tx: TenantTx, tenantId: string): Promise<string> {
  const tenant = await tx.tenants.findUniqueOrThrow({
    where: { id: tenantId },
    select: { owner_user_id: true },
  });
  return tenant.owner_user_id;
}

/** True when `roleId` is this tenant's Owner role. A role from another tenant reads as false. */
export async function isOwnerRole(
  tx: TenantTx,
  tenantId: string,
  roleId: string,
): Promise<boolean> {
  const role = await tx.roles.findFirst({
    where: { id: roleId, tenant_id: tenantId },
    select: { is_owner_role: true },
  });
  return role?.is_owner_role ?? false;
}

export const OWNER_ROLE_TAKEN = "The Owner role can't be given to anyone else.";
export const OWNER_ROLE_LOCKED = "The owner's role can't be changed.";
export const OWNER_CANT_DISABLE = "The owner can't be turned off.";
