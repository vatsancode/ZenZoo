import { UNIT_OPTIONS, type Product } from "../features/stocks/stocks";

export interface Category {
  id: string;
  name: string;
  subcategories: string[];
}

// Sample data standing in for a real capability, same as lib/stocks.ts: there is no
// catalogue capability on the backend yet. The starting set matches what the sample
// products already use, so every product belongs to a listed category.
let categories: Category[] = [
  { id: "cat-sarees", name: "Sarees", subcategories: ["Silk", "Cotton"] },
  { id: "cat-salwar", name: "Salwar", subcategories: ["Cotton", "Anarkali", "Palazzo"] },
  { id: "cat-tops", name: "Tops", subcategories: ["Cotton", "Kurti"] },
];

export async function listCategories(): Promise<Category[]> {
  return categories;
}

/** The categories as they are right now, for a form that builds its list synchronously. */
export function categoriesSnapshot(): Category[] {
  return categories;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function addCategory(name: string): Category | null {
  const clean = name.trim();
  if (clean === "" || categories.some((category) => same(category.name, clean))) return null;
  const category: Category = { id: `cat-${Date.now()}`, name: clean, subcategories: [] };
  categories = [...categories, category];
  return category;
}

/** Returns false when the new name is empty or already taken by another category. */
export function renameCategory(id: string, name: string): boolean {
  const clean = name.trim();
  if (
    clean === "" ||
    categories.some((category) => category.id !== id && same(category.name, clean))
  ) {
    return false;
  }
  categories = categories.map((category) =>
    category.id === id ? { ...category, name: clean } : category,
  );
  return true;
}

export function deleteCategory(id: string): void {
  categories = categories.filter((category) => category.id !== id);
}

export function addSubcategory(id: string, name: string): boolean {
  const clean = name.trim();
  const target = categories.find((category) => category.id === id);
  if (!target || clean === "" || target.subcategories.some((item) => same(item, clean)))
    return false;
  categories = categories.map((category) =>
    category.id === id
      ? { ...category, subcategories: [...category.subcategories, clean] }
      : category,
  );
  return true;
}

export function removeSubcategory(id: string, name: string): void {
  categories = categories.map((category) =>
    category.id === id
      ? { ...category, subcategories: category.subcategories.filter((item) => item !== name) }
      : category,
  );
}

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
