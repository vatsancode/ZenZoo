import { logAudit } from "./audit";
import { formatPrice } from "./stock-display";

/** How a catalogue item is priced: one set price, or a price agreed for each order. */
export type PricingMode = "fixed" | "custom";

/** Something sold that is not stock: a service, a charge, or any item without inventory to track. */
export interface CatalogueItem {
  id: string;
  name: string;
  category: string;
  pricing: PricingMode;
  /** The set price, for fixed pricing. */
  price?: number;
}

export interface CatalogueItemInput {
  name: string;
  category: string;
  pricing: PricingMode;
  price: number;
}

// Sample data standing in for a real capability, same as lib/stocks.ts: there is no
// catalogue capability on the backend yet. Swap these bodies for real API calls once
// one exists.
let categories: string[] = ["Services", "Tailoring", "Alterations", "Other"];

let items: CatalogueItem[] = [
  { id: "cat-1", name: "Blouse stitching", category: "Tailoring", pricing: "fixed", price: 450 },
  { id: "cat-2", name: "Saree fall and pico", category: "Tailoring", pricing: "fixed", price: 120 },
  { id: "cat-3", name: "Custom tailoring", category: "Tailoring", pricing: "custom" },
  { id: "cat-4", name: "Alteration", category: "Alterations", pricing: "custom" },
  { id: "cat-5", name: "Saree pre-pleating", category: "Services", pricing: "fixed", price: 150 },
  { id: "cat-6", name: "Gift wrapping", category: "Services", pricing: "fixed", price: 50 },
];

export async function listCatalogueItems(): Promise<CatalogueItem[]> {
  return items;
}

export function listCatalogueCategories(): string[] {
  return categories;
}

const round = (value: number) => Math.round(value * 100) / 100;

function rememberCategory(name: string) {
  if (!categories.some((item) => item.toLowerCase() === name.toLowerCase())) {
    categories = [...categories.filter((item) => item !== "Other"), name, "Other"];
  }
}

function clean(input: CatalogueItemInput) {
  const category = input.category.trim();
  rememberCategory(category);
  return {
    name: input.name.trim(),
    category,
    pricing: input.pricing,
    price: input.pricing === "fixed" ? round(input.price) : undefined,
  };
}

/** The fields of an item as the audit log shows them. */
function snapshot(item: CatalogueItem) {
  return {
    Name: item.name,
    Category: item.category,
    Pricing: item.pricing === "fixed" ? "Fixed price" : "Custom per order",
    Price: item.pricing === "fixed" ? formatPrice(item.price ?? 0) : null,
  };
}

/** Returns an error message when the name is already used, or null. */
export function addCatalogueItem(input: CatalogueItemInput): string | null {
  const next = clean(input);
  if (items.some((item) => item.name.toLowerCase() === next.name.toLowerCase())) {
    return "An item with this name already exists.";
  }
  const created: CatalogueItem = { id: `cat-${Date.now()}`, ...next };
  items = [created, ...items];
  logAudit({
    action: "created",
    module: "Catalogue",
    entity: "Catalogue item",
    label: created.name,
    before: null,
    after: snapshot(created),
  });
  return null;
}

export function editCatalogueItem(id: string, input: CatalogueItemInput): string | null {
  const next = clean(input);
  if (items.some((item) => item.id !== id && item.name.toLowerCase() === next.name.toLowerCase())) {
    return "An item with this name already exists.";
  }
  const previous = items.find((item) => item.id === id);
  items = items.map((item) => (item.id === id ? { id, ...next } : item));
  if (previous) {
    logAudit({
      action: "updated",
      module: "Catalogue",
      entity: "Catalogue item",
      label: next.name,
      before: snapshot(previous),
      after: snapshot({ id, ...next }),
    });
  }
  return null;
}

export function deleteCatalogueItem(id: string): void {
  const removed = items.find((item) => item.id === id);
  items = items.filter((item) => item.id !== id);
  if (removed) {
    logAudit({
      action: "deleted",
      module: "Catalogue",
      entity: "Catalogue item",
      label: removed.name,
      before: snapshot(removed),
      after: null,
    });
  }
}
