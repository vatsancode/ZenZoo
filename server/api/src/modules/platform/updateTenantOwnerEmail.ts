import { prisma } from "../../shared/prisma";

export interface UpdateTenantOwnerEmailResult {
  userId: string;
  email: string;
}

interface UpdateRow {
  user_id: string;
  email: string;
}

/**
 * Corrects a tenant's owner's email, via platform_update_tenant_owner_email()
 * - see resetTenantOwnerPassword for why this needs a SECURITY DEFINER
 * function rather than a plain Prisma update.
 */
export async function updateTenantOwnerEmail(
  tenantId: string,
  newEmail: string,
): Promise<UpdateTenantOwnerEmailResult> {
  try {
    const rows = await prisma.$queryRaw<UpdateRow[]>`
      SELECT * FROM platform_update_tenant_owner_email(${tenantId}::uuid, ${newEmail})
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("platform_update_tenant_owner_email returned no row");
    }
    return { userId: row.user_id, email: row.email };
  } catch (error) {
    // Runs as a raw query, so a unique-constraint violation surfaces as
    // Prisma's generic P2010 wrapping Postgres's own error text - match on
    // the underlying constraint name instead (see createUser.ts for the
    // same pattern).
    const message = error instanceof Error ? error.message : "";
    if (/users_email_key|unique constraint/i.test(message)) {
      throw new Error("Someone with that email already exists.");
    }
    throw error;
  }
}
