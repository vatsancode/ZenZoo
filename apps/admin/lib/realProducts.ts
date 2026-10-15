import { redirectToSignInIfUnauthorized } from "./auth";
import { ensureStoreId } from "./storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface RealVariant {
  id: string;
  name: string;
  sku: string | null;
  basePrice: string;
  unitId: string;
  /** The unit's code, resolved server-side - for display, never typed freely. */
  unit: string;
  status: "active" | "deactivated";
}

export interface RealProduct {
  id: string;
  name: string;
  categoryId: string | null;
  status: "active" | "archived";
  variants: RealVariant[];
  lowestPrice: string | null;
  variantCount: number;
}

/**
 * The real products/variants capability (server/api/src/capabilities/
 * products), not the apps/admin/features/stocks/stocks.ts mock - used where
 * a screen needs to pick an actual variant to buy (purchases), as opposed
 * to the stock-quantity screens, which are still mock until
 * inventory_batches has a frontend of its own.
 */
export async function listRealProducts(): Promise<RealProduct[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/products?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error("Couldn't load products.");
  }
  return (await response.json()) as RealProduct[];
}

export interface CreateVariantInput {
  name: string;
  sku?: string;
  basePrice: number;
  /** Starting stock, recorded as a real opening-stock batch - omit for none. */
  openingQuantity?: number;
  /** Required alongside openingQuantity. */
  openingUnitCost?: number;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** Adds a variant to an existing product - requires "stocks:edit". Returns the updated product, or an error message. */
export async function createVariant(
  sellableId: string,
  input: CreateVariantInput,
): Promise<RealProduct | string> {
  const response = await fetch(`${API_URL}/products/${sellableId}/variants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return (await response.json()) as RealProduct;
}

export interface CreateProductInput {
  name: string;
  /** Names the product's first variant, when it differs from the product's own name ("Has variants" on). Defaults to name. */
  variantName?: string;
  sku?: string;
  basePrice: number;
  unitId: string;
  categoryId: string;
  /** Starting stock, recorded as a real opening-stock batch - omit for none. */
  openingQuantity?: number;
  /** Required alongside openingQuantity. */
  openingUnitCost?: number;
}

/**
 * Creates a brand-new product with a single variant named to match it (or
 * variantName, when given) - the "simple product" shape createProduct's
 * own notes describe. Requires "stocks:edit". Returns the new product, or
 * an error message.
 */
export async function createProduct(input: CreateProductInput): Promise<RealProduct | string> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      storeId,
      name: input.name,
      categoryId: input.categoryId,
      variants: [
        {
          name: input.variantName?.trim() || input.name,
          sku: input.sku,
          basePrice: input.basePrice,
          unitId: input.unitId,
          openingQuantity: input.openingQuantity,
          openingUnitCost: input.openingUnitCost,
        },
      ],
    }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return (await response.json()) as RealProduct;
}

export interface UpdateProductInput {
  name: string;
  categoryId: string;
}

/** Renames/recategorizes a product - requires "stocks:edit". Returns the updated product, or an error message. */
export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<RealProduct | string> {
  const response = await fetch(`${API_URL}/products/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return (await response.json()) as RealProduct;
}

export interface UpdateVariantInput {
  name: string;
  sku?: string;
  basePrice: number;
}

/** Edits one variant's name/SKU/price - requires "stocks:edit". Unit isn't editable here - see updateProductUnit. Returns the updated product, or an error message. */
export async function updateVariant(
  id: string,
  input: UpdateVariantInput,
): Promise<RealProduct | string> {
  const response = await fetch(`${API_URL}/variants/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return (await response.json()) as RealProduct;
}

/** Sets every variant of a product to the same unit in one go - requires "stocks:edit". Returns the updated product, or an error message. */
export async function updateProductUnit(id: string, unitId: string): Promise<RealProduct | string> {
  const response = await fetch(`${API_URL}/products/${id}/unit`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ unitId }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return (await response.json()) as RealProduct;
}
