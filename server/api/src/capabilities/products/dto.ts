export interface VariantDto {
  id: string;
  name: string;
  sku: string | null;
  basePrice: string;
  unit: string;
  status: "active" | "deactivated";
}

export interface ProductDto {
  id: string;
  storeId: string;
  name: string;
  categoryId: string | null;
  status: "active" | "archived";
  variants: VariantDto[];
  /** Read-time projections - never stored, so they can't drift from the variant rows. */
  lowestPrice: string | null;
  variantCount: number;
}

interface VariantRow {
  id: string;
  name: string;
  sku: string | null;
  base_price: { toString(): string };
  unit: string;
  status: string;
}

interface SellableRow {
  id: string;
  store_id: string;
  name: string;
  category_id: string | null;
  status: string;
  variants: VariantRow[];
}

export function toVariantDto(row: VariantRow): VariantDto {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    basePrice: row.base_price.toString(),
    unit: row.unit,
    status: row.status === "active" ? "active" : "deactivated",
  };
}

export function toProductDto(row: SellableRow): ProductDto {
  const variants = row.variants.map(toVariantDto);
  const activePrices = variants
    .filter((variant) => variant.status === "active")
    .map((variant) => Number(variant.basePrice));
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    categoryId: row.category_id,
    status: row.status === "active" ? "active" : "archived",
    variants,
    lowestPrice: activePrices.length > 0 ? Math.min(...activePrices).toString() : null,
    variantCount: variants.length,
  };
}

export const VARIANT_SELECT = {
  id: true,
  name: true,
  sku: true,
  base_price: true,
  unit: true,
  status: true,
} as const;

export const PRODUCT_SELECT = {
  id: true,
  store_id: true,
  name: true,
  category_id: true,
  status: true,
  variants: { select: VARIANT_SELECT, orderBy: { created_at: "asc" } },
} as const;
