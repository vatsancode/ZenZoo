import { prisma } from "../../shared/prisma";
import { hashPassword } from "../../shared/password";

export interface ProvisionTenantInput {
  ownerEmail: string;
  ownerPassword: string;
  ownerFirstName: string;
  ownerLastName: string;
  tenantName: string;
  tenantSlug: string;
  storeName: string;
  storeCode: string;
}

export interface ProvisionTenantResult {
  userId: string;
  tenantId: string;
  storeId: string;
  membershipId: string;
}

interface ProvisionRow {
  user_id: string;
  tenant_id: string;
  store_id: string;
  membership_id: string;
}

/**
 * Creates a brand-new tenant, its main store, and its owner (with a
 * password), atomically - see provision_new_account() in
 * docs/db-design.md. Can only ever create a new island, never attach to
 * an existing tenant.
 */
export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const passwordHash = await hashPassword(input.ownerPassword);

  const rows = await prisma.$queryRaw<ProvisionRow[]>`
    SELECT * FROM provision_new_account(
      ${input.ownerEmail}, ${passwordHash}, ${input.ownerFirstName}, ${input.ownerLastName},
      ${input.tenantName}, ${input.tenantSlug}, ${input.storeName}, ${input.storeCode}
    )
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("provision_new_account returned no row");
  }
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    storeId: row.store_id,
    membershipId: row.membership_id,
  };
}
