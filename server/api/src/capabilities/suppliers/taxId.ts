import { UserFacingError } from "../../shared/errors";
import type { TenantTx } from "../../shared/tenantContext";

/**
 * A GSTIN belongs to one business, so two vendors sharing one would split that supplier's
 * purchase history in two. Archived vendors count too - the answer there is to reactivate
 * the old one, which the message names. (Same names are allowed: the admin only warns.)
 */
export async function assertTaxIdFree(
  tx: TenantTx,
  tenantId: string,
  taxId: string | null,
  exceptId?: string,
): Promise<void> {
  if (!taxId) return;
  const clash = await tx.suppliers.findFirst({
    where: {
      tenant_id: tenantId,
      tax_id: { equals: taxId, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true, status: true },
  });
  if (clash) {
    throw new UserFacingError(
      `${clash.name}${clash.status === "archived" ? " (archived)" : ""} already has this GSTIN.`,
    );
  }
}
