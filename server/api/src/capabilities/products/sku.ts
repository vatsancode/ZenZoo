import { Prisma } from "@prisma/client";
import { firstFreeCode } from "../../shared/names";
import type { TenantTx } from "../../shared/tenantContext";

// variants.sku is varchar(64).
const SKU_MAX_LENGTH = 64;

/** A code made from the names: "Oat Milk" -> "OAT-MILK", "Oat Milk" + "Large" -> "OAT-MILK-LARGE". */
export function skuBase(productName: string, variantName?: string): string {
  const sameAsProduct = variantName?.trim().toLowerCase() === productName.trim().toLowerCase();
  const text = variantName && !sameAsProduct ? `${productName} ${variantName}` : productName;
  const base = text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // A name with no English letters or digits (say, all Tamil) still needs a code.
  return base || "ITEM";
}

/**
 * The first SKU starting from the names that no variant in this tenant uses yet: OAT-MILK,
 * then OAT-MILK-2, OAT-MILK-3 ... SKUs are unique tenant-wide, ignoring case.
 */
export function generateSku(
  tx: TenantTx,
  tenantId: string,
  productName: string,
  variantName?: string,
): Promise<string> {
  return firstFreeCode(skuBase(productName, variantName), "-", SKU_MAX_LENGTH, async (code) => {
    const clash = await tx.variants.findFirst({
      where: { tenant_id: tenantId, sku: { equals: code, mode: "insensitive" } },
      select: { id: true },
    });
    return clash !== null;
  });
}

/** idx_variants_tenant_sku_unique fired - the SKU is taken (or was, a moment ago). */
export function isSkuClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * How many times to run a save whose SKU was generated for it. Two saves picking the same
 * free SKU at once makes the slower one fail the unique index; running it again picks the next.
 */
export const GENERATED_SKU_ATTEMPTS = 3;
