import { prisma } from "../../shared/prisma";
import { hashPassword } from "../../shared/password";

export interface ResetTenantOwnerPasswordResult {
  userId: string;
  email: string;
}

interface ResetRow {
  user_id: string;
  email: string;
}

/**
 * Resets a tenant's owner's password, via platform_reset_tenant_owner_password()
 * - see provision_new_account() in docs/db-design.md for why this needs a
 * SECURITY DEFINER function rather than a plain Prisma update.
 */
export async function resetTenantOwnerPassword(
  tenantId: string,
  newPassword: string,
): Promise<ResetTenantOwnerPasswordResult> {
  const passwordHash = await hashPassword(newPassword);

  const rows = await prisma.$queryRaw<ResetRow[]>`
    SELECT * FROM platform_reset_tenant_owner_password(${tenantId}::uuid, ${passwordHash})
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("platform_reset_tenant_owner_password returned no row");
  }
  return { userId: row.user_id, email: row.email };
}
