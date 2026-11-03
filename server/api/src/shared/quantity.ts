import { quantityIssue } from "@zenzoo/pricing";
import type { TenantTx } from "./tenantContext";

export { addQuantities, roundQuantity, subtractQuantity, toThousandths } from "@zenzoo/pricing";

/** A numeric(12,3) quantity as Prisma hands it back (a Decimal), as the plain number the API sends. */
export function toQuantity(value: { toString(): string } | number | null | undefined): number {
  return value == null ? 0 : Number(value.toString());
}

/** Throws the reason a quantity can't be stored for this unit, if there is one. */
export function assertQuantity(
  quantity: number,
  allowDecimals: boolean,
  options?: { allowZero?: boolean; unit?: string },
): void {
  const issue = quantityIssue(quantity, allowDecimals, options);
  if (issue) throw new Error(issue);
}

/**
 * Checks each line's quantity against its own variant's unit - whole numbers unless that unit
 * allows decimals. For any write that takes quantities for several variants at once.
 */
export async function assertVariantQuantities(
  tx: TenantTx,
  lines: { variantId: string; quantity: number }[],
): Promise<void> {
  const variants = await tx.variants.findMany({
    where: { id: { in: [...new Set(lines.map((line) => line.variantId))] } },
    select: { id: true, units: { select: { code: true, allow_decimals: true } } },
  });
  const unitOf = new Map(variants.map((variant) => [variant.id, variant.units]));
  for (const line of lines) {
    const unit = unitOf.get(line.variantId);
    assertQuantity(line.quantity, unit?.allow_decimals ?? false, { unit: unit?.code });
  }
}
