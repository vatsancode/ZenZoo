import { redirectToSignInIfUnauthorized } from "./auth";
import { ensureStoreId } from "./storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** How a catalogue item is priced: one set price, or a price agreed for each order. */
export type PricingMode = "fixed" | "custom";

/**
 * product = an inventory product someone made sellable (imported); its price
 * and stock live on the Stocks side. made_to_order = never counted as stock
 * itself - a service today, a cafe recipe later.
 */
export type CatalogueKind = "product" | "made_to_order";

/** Something the till may sell. */
export interface CatalogueItem {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  kind: CatalogueKind;
  pricing: PricingMode;
  /** The set price, for fixed pricing - for a product, its lowest active variant price. */
  price?: number;
  /** How many active variants it has - more than one shows as "from ₹X". */
  variantCount: number;
}

/** The made-to-order form. Products aren't edited here - their name and price live in Stocks. */
export interface CatalogueItemInput {
  name: string;
  categoryId: string;
  pricing: PricingMode;
  price: number;
}

/** An inventory product not yet in the catalogue - what "Import from inventory" offers. */
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  price: number | null;
  variantCount: number;
}

/** The server's CatalogueItemDto (server/api/src/capabilities/catalogue/dto.ts). */
interface CatalogueItemDto {
  id: string;
  name: string;
  kind: CatalogueKind;
  categoryId: string;
  categoryName: string;
  pricing: PricingMode;
  lowestPrice: string | null;
  variantCount: number;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** Everything the till may sell: imported products and made-to-order items. */
export async function listCatalogueItems(): Promise<CatalogueItem[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const rows = (await response.json()) as CatalogueItemDto[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    category: row.categoryName,
    kind: row.kind,
    pricing: row.pricing,
    price:
      row.pricing === "custom" || row.lowestPrice === null ? undefined : Number(row.lowestPrice),
    variantCount: row.variantCount,
  }));
}

// ---------------------------------------------------------------------------
// Made-to-order items - requires "catalogue:edit" (delete: "catalogue:delete").
// ---------------------------------------------------------------------------

/** Adds a made-to-order item. Returns an error message (e.g. the name is taken), or null. */
export async function addCatalogueItem(input: CatalogueItemInput): Promise<string | null> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, ...input }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

export async function editCatalogueItem(
  id: string,
  input: CatalogueItemInput,
): Promise<string | null> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue/items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, ...input }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

/** Deletes a made-to-order item. Past sales that included it are kept. Returns an error message, or null. */
export async function deleteCatalogueItem(id: string): Promise<string | null> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue/items/${id}?storeId=${storeId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inventory products in the catalogue: real, via server/api's catalogue
// capabilities. Nothing is copied - importing marks the product sellable.
// ---------------------------------------------------------------------------

/** Takes an imported product off the catalogue; it stays in inventory. Returns an error message, or null. */
export async function removeFromCatalogue(id: string): Promise<string | null> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue/${id}?storeId=${storeId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

export async function listUnimportedInventoryItems(): Promise<InventoryItem[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue/candidates?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const rows = (await response.json()) as CatalogueItemDto[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.categoryName,
    price: row.lowestPrice === null ? null : Number(row.lowestPrice),
    variantCount: row.variantCount,
  }));
}

/** Whether new inventory items land in the catalogue on their own. */
export async function getAutoImport(): Promise<boolean> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue/settings?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  return ((await response.json()) as { autoImport: boolean }).autoImport;
}

/**
 * Turns auto-import on or off. Turning it on also imports every product not
 * yet in the catalogue. Returns how many were added, or an error message.
 */
export async function setAutoImport(on: boolean): Promise<number | string> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, on }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return ((await response.json()) as { added: number }).added;
}

/** Adds the chosen inventory products to the catalogue. Returns how many were added, or an error message. */
export async function importInventoryItems(ids: string[]): Promise<number | string> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/catalogue/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, sellableIds: ids }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return ((await response.json()) as { added: number }).added;
}
