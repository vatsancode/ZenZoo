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

  let rows: ProvisionRow[];
  try {
    rows = await prisma.$queryRaw<ProvisionRow[]>`
      SELECT * FROM provision_new_account(
        ${input.ownerEmail}, ${passwordHash}, ${input.ownerFirstName}, ${input.ownerLastName},
        ${input.tenantName}, ${input.tenantSlug}, ${input.storeName}, ${input.storeCode}
      )
    `;
  } catch (error) {
    // Raw query, so Postgres's unique violation (23505) arrives wrapped in
    // Prisma's text - tell the two likely clashes apart by the key it names.
    const message = error instanceof Error ? error.message : "";
    if (/23505|already exists/i.test(message)) {
      if (/\(email\)/i.test(message)) throw new Error("Someone with that email already exists.");
      if (/\(slug\)/i.test(message)) throw new Error("That business web name is already taken.");
    }
    throw error;
  }
  const row = rows[0];
  if (!row) {
    console.error("provision_new_account returned no row");
    throw new Error("We couldn't create this tenant. Please try again.");
  }
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    storeId: row.store_id,
    membershipId: row.membership_id,
  };
}
