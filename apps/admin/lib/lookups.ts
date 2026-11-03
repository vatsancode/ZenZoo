import { redirectToSignInIfUnauthorized } from "./auth";
import { ensureStoreId } from "./storeContext";
import { listCategoriesFlat, type CategoryResponse } from "./catalogue";
import type { Account } from "../features/settings/accounts";
import type { PaymentMethod } from "../features/settings/paymentMethods";
import { listUnits, type Unit } from "../features/settings/units";
import type { Vendor } from "../features/vendors/vendors";
import { apiFetch } from "./apiFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Lookups: the small lists a picker needs, served under the asking screen's own permission
 * (server/api/src/capabilities/reads/lookups.ts) so a role doesn't need Settings, Vendors or
 * Customers just to use a screen it does have. They carry a name and a status - no balances or
 * contact details - so use the full lists (listVendors, listAccounts, ...) on the screens that
 * manage those things.
 */

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await errorMessage(response));
  }
  return (await response.json()) as T;
}

type Active = "active" | "inactive";

export type VendorLookup = Pick<Vendor, "id" | "name" | "status">;
export type AccountLookup = Pick<Account, "id" | "name" | "code" | "status">;
export type PaymentMethodLookup = Pick<PaymentMethod, "id" | "name" | "code" | "status">;

/** Who a sale was for. Name and phone only. */
export interface CustomerLookup {
  id: string;
  name: string;
  phone: string | null;
  status: "active" | "archived";
}

/** Vendors by name - for the Expenses payee, the Purchases vendor, and naming a stock batch's supplier. */
export async function lookupVendors(): Promise<VendorLookup[]> {
  const rows = await get<{ id: string; name: string; status: Active }[]>("/lookups/suppliers");
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status === "active" ? "active" : "archived",
  }));
}

/** This store's accounts by name - for "pay from" on Expenses and Purchases. */
export async function lookupAccounts(): Promise<AccountLookup[]> {
  const storeId = await ensureStoreId();
  const rows = await get<{ id: string; name: string; code: string; status: Active }[]>(
    `/lookups/accounts?storeId=${encodeURIComponent(storeId)}`,
  );
  return rows.map((row) => ({ ...row, status: row.status === "active" ? "active" : "disabled" }));
}

/** Payment methods by name - for paying a purchase. */
export async function lookupPaymentMethods(): Promise<PaymentMethodLookup[]> {
  const rows = await get<{ id: string; name: string; code: string; status: Active }[]>(
    "/lookups/payment-methods",
  );
  return rows.map((row) => ({ ...row, status: row.status === "active" ? "active" : "disabled" }));
}

/** Units, under Stocks or Purchases access - same shape as the Settings list. */
export function lookupUnits(): Promise<Unit[]> {
  return listUnits();
}

/** This store's categories (flat, with real ids), under Stocks or Purchases access. */
export function lookupCategories(): Promise<CategoryResponse[]> {
  return listCategoriesFlat();
}

/** Customers by name and phone, archived ones included - for naming who a sale was for. */
export async function lookupCustomers(): Promise<CustomerLookup[]> {
  const rows = await get<{ id: string; name: string; phone: string | null; status: Active }[]>(
    "/lookups/customers",
  );
  return rows.map((row) => ({
    ...row,
    status: row.status === "active" ? "active" : "archived",
  }));
}

/** A product the purchase form can buy: only names, SKUs and units, active variants only. */
export interface PurchasableProduct {
  id: string;
  name: string;
  variants: { id: string; name: string; sku: string | null; unit: string }[];
}

/** The purchase form's product picker, under "purchases:view". */
export async function lookupPurchasableProducts(): Promise<PurchasableProduct[]> {
  const storeId = await ensureStoreId();
  return get<PurchasableProduct[]>(`/lookups/purchase-products?storeId=${encodeURIComponent(storeId)}`);
}

export interface PurchaseVariantInput {
  name: string;
  sku?: string;
  basePrice: number;
}

/**
 * "Add new variant" from inside a purchase - requires "purchases:edit". No opening stock; that
 * is a Stocks action. Returns the updated product, or an error message.
 */
export async function createPurchaseVariant(
  productId: string,
  input: PurchaseVariantInput,
): Promise<PurchasableProduct | string> {
  const response = await apiFetch(`${API_URL}/purchase-products/${encodeURIComponent(productId)}/variants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await errorMessage(response);
  }
  return (await response.json()) as PurchasableProduct;
}
