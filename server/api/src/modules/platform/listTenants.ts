import { prisma } from "../../shared/prisma";

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  /** The owner's email, from the 'owner' tenant_memberships row created at provisioning. */
  ownerEmail: string | null;
}

interface PlatformListTenantsRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: Date;
  owner_email: string | null;
}

/**
 * Lists tenants, optionally filtered by a case-insensitive match on name or
 * slug, via platform_list_tenants() - a narrow SECURITY DEFINER function.
 * A plain Prisma query can't do this join: tenant_memberships and users are
 * both RLS-scoped to "the current tenant," and listing *all* tenants has no
 * single tenant to scope to, so an ordinary query would silently see zero
 * membership rows. See the migration adding platform_list_tenants for the
 * full reasoning.
 */
export async function listTenants(search?: string): Promise<TenantSummary[]> {
  const rows = await prisma.$queryRaw<PlatformListTenantsRow[]>`
    SELECT * FROM platform_list_tenants(${search?.trim() || null})
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    ownerEmail: row.owner_email,
  }));
}
