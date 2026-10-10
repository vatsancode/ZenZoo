import { redirectToSignInIfUnauthorized } from "./auth";
import { ensureStoreId } from "./storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface RealVariant {
  id: string;
  name: string;
  sku: string | null;
  basePrice: string;
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
