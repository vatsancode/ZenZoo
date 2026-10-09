import { UNIT_OPTIONS, type Product } from "../features/stocks/stocks";
import { redirectToSignInIfUnauthorized } from "./auth";
import { ensureStoreId } from "./storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Category {
  id: string;
  name: string;
  subcategories: string[];
}

interface CategoryResponse {
  id: string;
  storeId: string;
  name: string;
  parentId: string | null;
}

// Raw rows from the last listCategories() call, kept so removeSubcategory
// (which only gets a name, like the rest of this UI) can resolve it back to
// the real row id the API needs - see categoriesSnapshot/rawSnapshot below.
let rawSnapshot: CategoryResponse[] = [];

function toCategories(rows: CategoryResponse[]): Category[] {
  const topLevel = rows.filter((row) => row.parentId === null);
  return topLevel.map((row) => ({
    id: row.id,
    name: row.name,
    subcategories: rows.filter((child) => child.parentId === row.id).map((child) => child.name),
  }));
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** Lists this store's categories from the real API - requires at least "catalogue:view". */
export async function listCategories(): Promise<Category[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/categories?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  rawSnapshot = (await response.json()) as CategoryResponse[];
  return toCategories(rawSnapshot);
}

/** The categories as of the last listCategories() call, for a form that builds its list synchronously. */
export function categoriesSnapshot(): Category[] {
  return toCategories(rawSnapshot);
}

/** Creates a top-level category - requires "catalogue:edit". Returns the new category, or null on error. */
export async function addCategory(name: string): Promise<Category | null> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, name }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return null;
  }
  const row = (await response.json()) as CategoryResponse;
  return { id: row.id, name: row.name, subcategories: [] };
}

/** Renames a category or subcategory - requires "catalogue:edit". Returns false on error. */
export async function renameCategory(id: string, name: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  if (!response.ok) redirectToSignInIfUnauthorized(response);
  return response.ok;
}

/** Deletes a category (and its subcategories) - requires "catalogue:delete". Returns an error message, or null on success. */
export async function deleteCategory(id: string): Promise<string | null> {
  const response = await fetch(`${API_URL}/categories/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return null;
}

/** Adds a subcategory under an existing top-level category - requires "catalogue:edit". Returns false on error. */
export async function addSubcategory(id: string, name: string): Promise<boolean> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, name, parentId: id }),
  });
  if (!response.ok) redirectToSignInIfUnauthorized(response);
  return response.ok;
}

/** Removes a subcategory by name, resolved against the last listCategories() snapshot. */
export async function removeSubcategory(id: string, name: string): Promise<void> {
  const child = rawSnapshot.find((row) => row.parentId === id && row.name === name);
  if (!child) return;
  await fetch(`${API_URL}/categories/${child.id}`, { method: "DELETE", credentials: "include" });
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Products using a category, so it can be shown and protected from deletion. */
export function productsInCategory(products: Product[], name: string): number {
  return products.filter((product) => same(product.category, name)).length;
}

export function productsInSubcategory(products: Product[], category: string, name: string): number {
  return products.filter(
    (product) => same(product.category, category) && same(product.subcategory ?? "", name),
  ).length;
}

/** Applies a category rename to the products that carry the old name. */
export function renameCategoryInProducts(products: Product[], from: string, to: string): Product[] {
  return products.map((product) =>
    same(product.category, from) ? { ...product, category: to.trim() } : product,
  );
}

// ------------------------------------------------------------------ units

export interface UnitDef {
  code: string;
  name: string;
  /** Whether a quantity in this unit can have a fraction, like 1.5 kg. */
  decimals: boolean;
  /** Built-in units can't be removed. */
  builtin: boolean;
}

let units: UnitDef[] = [
  { code: "pcs", name: "Pieces", decimals: false, builtin: true },
  { code: "kg", name: "Kilograms", decimals: true, builtin: true },
  { code: "g", name: "Grams", decimals: true, builtin: true },
  { code: "L", name: "Litres", decimals: true, builtin: true },
  { code: "ml", name: "Millilitres", decimals: true, builtin: true },
];

export async function listUnits(): Promise<UnitDef[]> {
  return units;
}

/** Adds a custom unit and makes it available in the product forms. Returns an error message, or null. */
export function addUnit(code: string, name: string, decimals: boolean): string | null {
  const cleanCode = code.trim();
  const cleanName = name.trim();
  if (cleanCode === "") return "Enter a short code, like doz.";
  if (cleanName === "") return "Enter the unit's name, like Dozen.";
  if (units.some((unit) => same(unit.code, cleanCode)))
    return "A unit with this code already exists.";
  units = [...units, { code: cleanCode, name: cleanName, decimals, builtin: false }];
  UNIT_OPTIONS.push({ value: cleanCode, label: cleanCode });
  return null;
}

/** Removes a custom unit. Built-in units, and units still in use, are kept. */
export function removeUnit(code: string): void {
  units = units.filter((unit) => unit.builtin || unit.code !== code);
  const index = UNIT_OPTIONS.findIndex((option) => option.value === code);
  if (index >= 0 && !["pcs", "kg", "g", "L", "ml"].includes(code)) UNIT_OPTIONS.splice(index, 1);
}

/** How many products (or variants) are counted in this unit. */
export function productsUsingUnit(products: Product[], code: string): number {
  return products.reduce(
    (sum, product) =>
      sum +
      (product.variants
        ? product.variants.filter((variant) => variant.unit === code).length
        : product.unit === code
          ? 1
          : 0),
    0,
  );
}
