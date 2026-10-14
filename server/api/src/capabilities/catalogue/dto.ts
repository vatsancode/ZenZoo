export interface CatalogueItemDto {
  id: string;
  name: string;
  /** product = counted stock; made_to_order = never counted itself (a service, later a recipe). */
  kind: "product" | "made_to_order";
  categoryId: string;
  categoryName: string;
  /** custom = price agreed per order at the till; only made-to-order items can be custom. */
  pricing: "fixed" | "custom";
  /** Read-time projections over active variants - never stored, so they can't drift. */
  lowestPrice: string | null;
  variantCount: number;
}

export interface CatalogueSettingsDto {
  /** New products land in the catalogue on their own when this is on. */
  autoImport: boolean;
}

interface CatalogueRow {
  id: string;
  name: string;
  kind: string;
  category_id: string;
  pricing_mode: string;
  categories: { name: string };
  variants: { base_price: { toString(): string } }[];
}

export function toCatalogueItemDto(row: CatalogueRow): CatalogueItemDto {
  const prices = row.variants.map((variant) => Number(variant.base_price.toString()));
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "made_to_order" ? "made_to_order" : "product",
    categoryId: row.category_id,
    categoryName: row.categories.name,
    pricing: row.pricing_mode === "custom" ? "custom" : "fixed",
    lowestPrice: prices.length > 0 ? Math.min(...prices).toString() : null,
    variantCount: prices.length,
  };
}

/** Only active variants count - a deactivated one can't be sold, so it shouldn't set the price. */
export const CATALOGUE_SELECT = {
  id: true,
  name: true,
  kind: true,
  category_id: true,
  pricing_mode: true,
  categories: { select: { name: true } },
  variants: { where: { status: "active" }, select: { base_price: true } },
} as const;
