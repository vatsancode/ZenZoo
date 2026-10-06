/** The units every shop starts with. More can be added in Settings. */
export const UNITS = ["pcs", "kg", "g", "L", "ml"] as const;
export type Unit = string;
// Mutable on purpose: Settings adds a custom unit here, so forms opened afterwards offer it.
export const UNIT_OPTIONS: { value: string; label: string }[] = UNITS.map((unit) => ({
  value: unit,
  label: unit,
}));

export interface Variant {
  name: string;
  sku: string;
  price: number;
  purchasePrice: number;
  quantity: number;
  unit: Unit;
}

export interface Product {
  /** Row identity. Equal to `sku` for simple products; variant products have no single SKU. */
  id: string;
  /** Empty for a product with variants - each variant carries its own. */
  sku: string;
  name: string;
  category: string;
  subcategory?: string;
  /** For a product with variants, the lowest variant price. */
  price: number;
  purchasePrice?: number;
  /** For a product with variants, the total across variants. */
  quantity: number;
  unit?: Unit;
  variants?: Variant[];
}

// Sample data standing in for a real capability. There's no products/stock
// read capability on the backend yet (server/api has no modules for this
// domain), so this returns fixed sample rows rather than faking a network
// call to an endpoint that doesn't exist. Swap this for a real
// apiGet("/products") (or whatever the capability ends up being called)
// once that capability exists - the component calling this doesn't need to
// change, only this function's body.
function simpleProduct(
  sku: string,
  name: string,
  category: string,
  subcategory: string,
  price: number,
  purchasePrice: number,
  quantity: number,
): Product {
  return { id: sku, sku, name, category, subcategory, price, purchasePrice, quantity, unit: "pcs" };
}

/** What a product with variants shows in the list: lowest price, total stock, shared unit. */
function summarizeVariants(variants: Variant[]): Pick<Product, "price" | "quantity" | "unit"> {
  const unit = variants[0]?.unit;
  return {
    price: Math.min(...variants.map((variant) => variant.price)),
    quantity: variants.reduce((sum, variant) => sum + variant.quantity, 0),
    unit: variants.every((variant) => variant.unit === unit) ? unit : undefined,
  };
}

function variantProduct(
  id: string,
  name: string,
  category: string,
  subcategory: string,
  variants: Variant[],
): Product {
  return {
    id,
    sku: "",
    name,
    category,
    subcategory,
    ...summarizeVariants(variants),
    variants,
  };
}

function sizes(
  prefix: string,
  price: number,
  purchasePrice: number,
  stock: Record<string, number>,
  /** Added to the base price for the sizes listed (e.g. larger sizes cost more). */
  surcharge: Record<string, number> = {},
): Variant[] {
  return Object.entries(stock).map(([size, quantity]) => ({
    name: size,
    sku: `${prefix}-${size}`,
    price: price + (surcharge[size] ?? 0),
    purchasePrice,
    quantity,
    unit: "pcs",
  }));
}

const featuredProducts: Product[] = [
  simpleProduct("SKU-SR-1001", "Kanchipuram silk saree, maroon", "Sarees", "Silk", 14500, 11000, 6),
  simpleProduct(
    "SKU-SR-1002",
    "Banarasi silk saree, royal blue",
    "Sarees",
    "Silk",
    16800,
    12800,
    4,
  ),
  simpleProduct(
    "SKU-SR-1003",
    "Handloom cotton saree, mustard",
    "Sarees",
    "Cotton",
    3800,
    2600,
    22,
  ),
  simpleProduct(
    "SKU-SR-1004",
    "Georgette party-wear saree, wine",
    "Sarees",
    "Party wear",
    5800,
    4100,
    0,
  ),
  simpleProduct("SKU-SR-1005", "Chanderi saree, pastel green", "Sarees", "Cotton", 5200, 3500, 14),
  variantProduct("salwar-cotton-set", "Cotton salwar set, printed", "Salwar", "Cotton", [
    ...sizes("SKU-SW-2001", 1450, 950, { S: 8, M: 14, L: 12, XL: 5 }, { XL: 100 }),
  ]),
  variantProduct("salwar-anarkali-set", "Anarkali salwar set, embroidered", "Salwar", "Anarkali", [
    ...sizes("SKU-SW-2002", 3400, 2300, { M: 3, L: 2, XL: 0 }, { L: 150, XL: 300 }),
  ]),
  simpleProduct("SKU-SW-2003", "Palazzo salwar set, mint", "Salwar", "Palazzo", 2100, 1400, 9),
  variantProduct("top-block-print", "Block print cotton top", "Tops", "Cotton", [
    ...sizes("SKU-TP-3001", 650, 380, { S: 16, M: 20, L: 18 }),
  ]),
  variantProduct("top-embroidered-kurti", "Embroidered kurti top", "Tops", "Kurti", [
    ...sizes("SKU-TP-3002", 1250, 780, { S: 6, M: 9, L: 7, XL: 4 }, { XL: 100 }),
  ]),
  simpleProduct("SKU-TP-3003", "Linen shirt top, off-white", "Tops", "Casual", 990, 600, 31),
];

// A hundred more boutique products so the list has realistic length. Built from
// a seeded generator, so the same rows appear on every visit.
function generatedProducts(): Product[] {
  let state = 20261004;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)] as T;
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  const toFifty = (amount: number) => Math.round(amount / 50) * 50;

  const colors = [
    "maroon",
    "royal blue",
    "mustard",
    "wine",
    "pastel green",
    "mint",
    "peach",
    "teal",
    "off-white",
    "black",
    "rose pink",
    "emerald",
    "lavender",
    "coral",
    "navy",
    "grey",
    "ivory",
    "turquoise",
    "saffron",
    "magenta",
  ];
  // Mostly in stock, some low, a few out.
  const stockLevel = () => {
    const roll = random();
    return roll < 0.08 ? 0 : roll < 0.28 ? between(1, 10) : between(11, 45);
  };

  const variantStock = () => {
    const roll = random();
    return roll < 0.1 ? 0 : roll < 0.3 ? between(1, 9) : between(10, 24);
  };

  type Line = { category: string; subcategory: string; names: string[]; low: number; high: number };
  const sarees: Line[] = [
    {
      category: "Sarees",
      subcategory: "Silk",
      names: [
        "Mysore silk saree",
        "Pochampally silk saree",
        "Tussar silk saree",
        "Uppada silk saree",
        "Kanchipuram silk saree",
      ],
      low: 6500,
      high: 18000,
    },
    {
      category: "Sarees",
      subcategory: "Cotton",
      names: [
        "Chettinad cotton saree",
        "Kota doria saree",
        "Mangalagiri cotton saree",
        "Linen saree",
        "Handloom cotton saree",
      ],
      low: 1800,
      high: 4500,
    },
    {
      category: "Sarees",
      subcategory: "Party wear",
      names: [
        "Satin sequin saree",
        "Net embroidered saree",
        "Organza saree",
        "Georgette party-wear saree",
      ],
      low: 3500,
      high: 9000,
    },
  ];
  const salwars: Line[] = [
    {
      category: "Salwar",
      subcategory: "Cotton",
      names: ["Cotton salwar set", "Printed salwar set"],
      low: 1200,
      high: 2600,
    },
    {
      category: "Salwar",
      subcategory: "Anarkali",
      names: ["Anarkali salwar set", "Embroidered Anarkali set"],
      low: 2800,
      high: 5600,
    },
    {
      category: "Salwar",
      subcategory: "Palazzo",
      names: ["Palazzo salwar set", "Printed palazzo set"],
      low: 1800,
      high: 3200,
    },
    {
      category: "Salwar",
      subcategory: "Patiala",
      names: ["Patiala salwar set", "Phulkari patiala set"],
      low: 1900,
      high: 3600,
    },
  ];
  const tops: Line[] = [
    {
      category: "Tops",
      subcategory: "Cotton",
      names: ["Block print cotton top", "Cotton tunic top"],
      low: 500,
      high: 1100,
    },
    {
      category: "Tops",
      subcategory: "Kurti",
      names: ["Embroidered kurti top", "Short kurti", "Straight kurti"],
      low: 900,
      high: 1800,
    },
    {
      category: "Tops",
      subcategory: "Casual",
      names: ["Linen shirt top", "Crop top", "Peplum top"],
      low: 600,
      high: 1500,
    },
    {
      category: "Tops",
      subcategory: "Party wear",
      names: ["Georgette party top", "Sequin party top"],
      low: 1400,
      high: 2800,
    },
  ];

  const used = new Set(featuredProducts.map((product) => product.name));
  const nameFor = (line: Line) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const name = `${pick(line.names)}, ${pick(colors)}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    return `${pick(line.names)}, ${pick(colors)} ${used.size}`;
  };
  const allSizes = ["S", "M", "L", "XL"];

  const products: Product[] = [];
  const make = (
    lines: Line[],
    count: number,
    prefix: string,
    firstNumber: number,
    variantShare: number,
  ) => {
    for (let index = 0; index < count; index++) {
      const line = pick(lines);
      const name = nameFor(line);
      const price = toFifty(between(line.low, line.high));
      const purchasePrice = toFifty(price * (0.62 + random() * 0.14));
      const sku = `SKU-${prefix}-${firstNumber + index}`;

      if (random() < variantShare) {
        const sizeCount = between(3, 4);
        const variants: Variant[] = allSizes.slice(4 - sizeCount).map((size) => ({
          name: size,
          sku: `${sku}-${size}`,
          // Larger sizes cost a little more.
          price: size === "XL" ? price + toFifty(price * 0.08) : price,
          purchasePrice,
          quantity: variantStock(),
          unit: "pcs",
        }));
        products.push(
          variantProduct(
            `product-${prefix.toLowerCase()}-${firstNumber + index}`,
            name,
            line.category,
            line.subcategory,
            variants,
          ),
        );
      } else {
        products.push(
          simpleProduct(
            sku,
            name,
            line.category,
            line.subcategory,
            price,
            purchasePrice,
            stockLevel(),
          ),
        );
      }
    }
  };

  make(sarees, 40, "SR", 1006, 0);
  make(salwars, 30, "SW", 2004, 0.7);
  make(tops, 30, "TP", 3004, 0.8);
  return products;
}

const sampleProducts: Product[] = [...featuredProducts, ...generatedProducts()];

// In-memory stand-in for the database: lives for as long as the page is open,
// so edits survive moving between screens but not a refresh.
let store: Product[] = sampleProducts;

export async function listProducts(): Promise<Product[]> {
  return store;
}

export function saveProducts(next: Product[]): void {
  store = next;
}

export interface AddStockInput {
  name: string;
  category: string;
  subcategory: string;
  /** Used when the product has no variants. Blank SKU means "generate one". */
  sku: string;
  price: number;
  purchasePrice: number;
  quantity: number;
  unit: Unit;
  /** Non-empty when the product has variants; each carries its own SKU, prices, quantity, unit. */
  variants: Variant[];
}

export type AddStockResult =
  { ok: true; products: Product[]; product: Product } | { ok: false; sku: string; error: string };

// UI-only stand-in for an "add stock" action capability. Same shape the real
// call will have to satisfy: given the current list and an input, say what the
// list looks like afterwards, or why it can't. Replace with an API call once
// that capability exists.
export function addStock(current: Product[], input: AddStockInput): AddStockResult {
  const stamp = String(Date.now()).slice(-5);
  const withSku = (sku: string, index: number) => sku.trim() || `SKU-${stamp}${index || ""}`;

  const variants = input.variants.map((variant, index) => ({
    ...variant,
    sku: withSku(variant.sku, index + 1),
  }));
  const sku = variants.length > 0 ? "" : withSku(input.sku, 0);

  const taken = new Map<string, string>();
  for (const row of current) {
    if (row.sku) taken.set(row.sku.toLowerCase(), row.name);
    for (const variant of row.variants ?? []) {
      taken.set(variant.sku.toLowerCase(), `${row.name} (${variant.name})`);
    }
  }
  for (const candidate of variants.length > 0 ? variants.map((v) => v.sku) : [sku]) {
    const owner = taken.get(candidate.toLowerCase());
    if (owner) {
      return { ok: false, sku: candidate, error: `This SKU is already used by ${owner}.` };
    }
  }

  const product: Product =
    variants.length > 0
      ? {
          id: `product-${stamp}`,
          sku: "",
          name: input.name.trim(),
          category: input.category,
          subcategory: input.subcategory.trim() || undefined,
          ...summarizeVariants(variants),
          variants,
        }
      : {
          id: sku,
          sku,
          name: input.name.trim(),
          category: input.category,
          subcategory: input.subcategory.trim() || undefined,
          price: input.price,
          purchasePrice: input.purchasePrice,
          quantity: input.quantity,
          unit: input.unit,
        };
  return { ok: true, products: [product, ...current], product };
}

// UI-only stand-in for an "update product" action capability.
// Products with variants only take the product-level fields here (name,
// category, subcategory) - each variant's SKU, price and stock is edited on
// the variants page.
export function editProduct(current: Product[], id: string, input: AddStockInput): AddStockResult {
  const existing = current.find((row) => row.id === id);
  if (!existing) {
    return { ok: false, sku: "", error: "This product no longer exists." };
  }

  const shared = {
    name: input.name.trim(),
    category: input.category,
    subcategory: input.subcategory.trim() || undefined,
  };

  let product: Product;
  if (existing.variants) {
    product = { ...existing, ...shared };
  } else {
    const sku = input.sku.trim() || existing.sku;
    const clash = current.find(
      (row) =>
        row.id !== id &&
        (row.sku.toLowerCase() === sku.toLowerCase() ||
          (row.variants ?? []).some((variant) => variant.sku.toLowerCase() === sku.toLowerCase())),
    );
    if (clash) {
      return { ok: false, sku, error: `This SKU is already used by ${clash.name}.` };
    }
    product = {
      ...existing,
      ...shared,
      sku,
      price: input.price,
      purchasePrice: input.purchasePrice,
      quantity: input.quantity,
      unit: input.unit,
    };
  }
  return { ok: true, products: current.map((row) => (row.id === id ? product : row)), product };
}

export type VariantInput = Variant;

/** The product (or variant) already using `sku`, ignoring one variant that is being edited. */
function findSkuClash(
  current: Product[],
  sku: string,
  ignore?: { productId: string; sku: string },
): string | undefined {
  const wanted = sku.toLowerCase();
  for (const row of current) {
    if (row.sku.toLowerCase() === wanted) return row.name;
    const variant = (row.variants ?? []).find(
      (item) =>
        item.sku.toLowerCase() === wanted &&
        !(row.id === ignore?.productId && item.sku === ignore.sku),
    );
    if (variant) return `${row.name} (${variant.name})`;
  }
  return undefined;
}

// UI-only stand-in for an "add variant" action capability. Rolls the
// product's price, stock and unit back up from its variants afterwards.
export function addVariant(
  current: Product[],
  productId: string,
  input: VariantInput,
): AddStockResult {
  const existing = current.find((row) => row.id === productId);
  if (!existing?.variants) {
    return { ok: false, sku: "", error: "This product no longer exists." };
  }

  const sku = input.sku.trim() || `SKU-${String(Date.now()).slice(-6)}`;
  const owner = findSkuClash(current, sku);
  if (owner) {
    return { ok: false, sku, error: `This SKU is already used by ${owner}.` };
  }

  const variants = [...existing.variants, { ...input, name: input.name.trim(), sku }];
  const product: Product = { ...existing, ...summarizeVariants(variants), variants };
  return {
    ok: true,
    products: current.map((row) => (row.id === productId ? product : row)),
    product,
  };
}

// UI-only stand-in for an "update variant" action capability. Rolls the
// product's price, stock and unit back up from its variants afterwards.
export function editVariant(
  current: Product[],
  productId: string,
  originalSku: string,
  input: VariantInput,
): AddStockResult {
  const existing = current.find((row) => row.id === productId);
  if (!existing?.variants) {
    return { ok: false, sku: "", error: "This product no longer exists." };
  }

  const sku = input.sku.trim() || originalSku;
  const owner = findSkuClash(current, sku, { productId, sku: originalSku });
  if (owner) {
    return { ok: false, sku, error: `This SKU is already used by ${owner}.` };
  }

  const variants = existing.variants.map((variant) =>
    variant.sku === originalSku ? { ...input, name: input.name.trim(), sku } : variant,
  );
  const product: Product = { ...existing, ...summarizeVariants(variants), variants };
  return {
    ok: true,
    products: current.map((row) => (row.id === productId ? product : row)),
    product,
  };
}

// UI-only stand-in for a stock movement. Moves a product's (or one variant's)
// quantity up or down and rolls variant stock back up to the product.
export function adjustQuantity(
  current: Product[],
  productId: string,
  variantSku: string | undefined,
  delta: number,
): Product[] {
  return current.map((row) => {
    if (row.id !== productId) return row;
    if (row.variants && variantSku) {
      const variants = row.variants.map((variant) =>
        variant.sku === variantSku ? { ...variant, quantity: variant.quantity + delta } : variant,
      );
      return { ...row, ...summarizeVariants(variants), variants };
    }
    return { ...row, quantity: row.quantity + delta };
  });
}

// UI-only stand-in for the PURCHASED stock movements a delivery creates: adds
// each received quantity to its product or variant.
export function receiveStock(
  current: Product[],
  arrived: { productId: string; sku: string; quantity: number }[],
): Product[] {
  return arrived.reduce(
    (products, item) =>
      item.quantity > 0
        ? adjustQuantity(products, item.productId, item.sku, item.quantity)
        : products,
    current,
  );
}

// UI-only stand-in for the PURCHASE_RETURN stock movements: takes each returned
// quantity off its product or variant, never taking stock below zero.
export function returnStock(
  current: Product[],
  sent: { productId: string; sku: string; quantity: number }[],
): Product[] {
  return sent.reduce((products, item) => {
    if (item.quantity <= 0) return products;
    const product = products.find((row) => row.id === item.productId);
    const onHand = product?.variants
      ? (product.variants.find((variant) => variant.sku === item.sku)?.quantity ?? 0)
      : (product?.quantity ?? 0);
    return adjustQuantity(products, item.productId, item.sku, -Math.min(item.quantity, onHand));
  }, current);
}

// UI-only stand-in for the SOLD stock movements a sale creates: takes each sold
// quantity off its product or variant, never taking stock below zero.
export function sellStock(
  current: Product[],
  sold: { productId: string; sku: string; quantity: number }[],
): Product[] {
  return returnStock(current, sold);
}
