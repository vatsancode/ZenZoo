/**
 * A product as the purchase form sees it: something to buy. Names, SKUs and units - no selling
 * price, no stock, no category. Active products and active variants only; a draft that already
 * holds a since-retired variant keeps showing its own saved line, not this list.
 */
export interface PurchasableVariantDto {
  id: string;
  name: string;
  sku: string | null;
  /** The unit's code, for display next to the quantity. */
  unit: string;
}

export interface PurchasableProductDto {
  id: string;
  name: string;
  variants: PurchasableVariantDto[];
}

export const PURCHASABLE_PRODUCT_SELECT = {
  id: true,
  name: true,
  variants: {
    where: { status: "active" },
    orderBy: { created_at: "asc" },
    select: { id: true, name: true, sku: true, units: { select: { code: true } } },
  },
} as const;

interface PurchasableProductRow {
  id: string;
  name: string;
  variants: { id: string; name: string; sku: string | null; units: { code: string } }[];
}

export function toPurchasableProductDto(row: PurchasableProductRow): PurchasableProductDto {
  return {
    id: row.id,
    name: row.name,
    variants: row.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      unit: variant.units.code,
    })),
  };
}
