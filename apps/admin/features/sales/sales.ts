import { paymentMethodLabel } from "../../lib/payment-options";
import { logAudit } from "../../lib/audit";
import type { CatalogueItem } from "../../lib/catalogue-items";
import type { Product, Unit } from "../stocks/stocks";

export type DiscountType = "amount" | "percent";

/** A line in the cart as the cashier edits it: the discount stays a string while being typed. */
export interface CartLine {
  sku: string;
  productId: string;
  name: string;
  unit: Unit;
  unitPrice: number;
  quantity: number;
  /** Units on hand when the line was added; a sale can't take more than this. */
  stock: number;
  /** What one unit cost to buy. Undefined when no purchase price is recorded. */
  unitCost?: number;
  discountValue: string;
  discountType: DiscountType;
  /** A catalogue item (a service or the like), not stock: no stock limit, and nothing leaves inventory. */
  service?: boolean;
  /** Priced for each order: the price is typed at the till. */
  customPrice?: boolean;
  /** What was typed for a custom price. */
  priceValue?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  /** ISO date the customer was first added, YYYY-MM-DD. */
  since?: string;
}

export interface SaleLine {
  sku: string;
  productId: string;
  name: string;
  unit: Unit;
  quantity: number;
  unitPrice: number;
  /** Rupees taken off this line. */
  discount: number;
  /** What one unit cost to buy, when it was recorded. */
  unitCost?: number;
  /** How many of these the customer has brought back. */
  returned?: number;
  /** A catalogue item (service) rather than stock. */
  service?: boolean;
}

export const SALE_RETURN_REASONS = [
  "Defective or damaged",
  "Wrong size or fit",
  "Not as described",
  "Changed their mind",
  "Other",
] as const;

/**
 * How the customer is made whole. The `sale_returns` tables in docs/db-design.md carry
 * no money columns and the refund mechanism is a known gap there, so it lives on the
 * return for now.
 * - money: paid back to the customer
 * - credit: kept as store credit on their account (needs a known customer)
 * - none: nothing paid back
 */
export type SaleRefundMode = "money" | "credit" | "none";

export interface SaleReturn {
  id: string;
  /** What is printed on the credit slip, e.g. RET-0001. Given once the return is completed. */
  number: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  reason: string;
  note?: string;
  items: { sku: string; name: string; unit: Unit; quantity: number; unitRefund: number }[];
  /** What the returned goods were worth to the customer: what they actually paid for them. */
  value: number;
  refund: {
    mode: SaleRefundMode;
    /** Paid back or credited; can be less than `value`. */
    amount: number;
    /** How the money went back, for mode "money". */
    method?: string;
    /** The account it was paid out of, for mode "money". */
    accountId?: string;
  };
}

/** One way a sale was paid: how much, by what method, into which account. */
export interface SalePayment {
  method: string;
  accountId: string;
  /** What this payment counts for on the bill. */
  amount: number;
  /** For cash: what the customer actually handed over, when it was more than `amount`. */
  tendered?: number;
}

export interface Sale {
  id: string;
  /** What is printed on the bill, e.g. INV-0007. */
  number: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  customerId?: string;
  customerName: string;
  lines: SaleLine[];
  /** Before any discount. */
  subtotal: number;
  lineDiscounts: number;
  billDiscount: number;
  total: number;
  /** Money taken now, one entry per way it was paid. Empty when store credit or credit sales covered it all. */
  payments: SalePayment[];
  /** Left unpaid and put on the customer's account, to be collected later. */
  dueAmount?: number;
  /** Store credit spent on this sale, taken off what was owed. */
  creditUsed?: number;
  /** Goods the customer brought back, oldest first. */
  returns?: SaleReturn[];
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Rupees off, from what was typed: a flat amount, or a percentage of `base`. Never below 0 or above `base`. */
export function discountAmount(base: number, typed: string, type: DiscountType): number {
  const value = typed.trim() === "" ? 0 : Number(typed);
  if (Number.isNaN(value) || value <= 0 || base <= 0) return 0;
  const raw = type === "percent" ? (base * Math.min(value, 100)) / 100 : value;
  return round(Math.min(raw, base));
}

export function lineGross(line: CartLine): number {
  return round(line.quantity * line.unitPrice);
}

export function lineDiscount(line: CartLine): number {
  return discountAmount(lineGross(line), line.discountValue, line.discountType);
}

export function lineNet(line: CartLine): number {
  return round(lineGross(line) - lineDiscount(line));
}

/** The bill discount comes off what is left after each line's own discount. */
export function cartTotals(lines: CartLine[], billTyped: string, billType: DiscountType) {
  const subtotal = round(lines.reduce((sum, line) => sum + lineGross(line), 0));
  const lineDiscounts = round(lines.reduce((sum, line) => sum + lineDiscount(line), 0));
  const afterLines = round(subtotal - lineDiscounts);
  const billDiscount = discountAmount(afterLines, billTyped, billType);
  return { subtotal, lineDiscounts, billDiscount, total: round(afterLines - billDiscount) };
}

export interface Profit {
  /** What was taken for it. */
  revenue: number;
  /** What it cost to buy. */
  cost: number;
  profit: number;
  /** Profit as a share of revenue, in percent. */
  margin: number;
  /** False when some item has no purchase price, so the profit is overstated. */
  known: boolean;
}

function makeProfit(revenue: number, cost: number, known: boolean): Profit {
  const profit = round(revenue - cost);
  return {
    revenue: round(revenue),
    cost: round(cost),
    profit,
    margin: revenue > 0 ? round((profit / revenue) * 100) : 0,
    known,
  };
}

/** Profit on one line, after that line's own discount. */
export function lineProfit(line: CartLine): Profit {
  return makeProfit(
    lineNet(line),
    (line.unitCost ?? 0) * line.quantity,
    line.unitCost !== undefined,
  );
}

/** Profit on the whole sale, after every discount including the one on the bill. */
export function saleProfit(lines: CartLine[], billTyped: string, billType: DiscountType): Profit {
  const { total } = cartTotals(lines, billTyped, billType);
  const cost = lines.reduce((sum, line) => sum + (line.unitCost ?? 0) * line.quantity, 0);
  return makeProfit(
    total,
    cost,
    lines.every((line) => line.unitCost !== undefined),
  );
}

// Sample data standing in for real capabilities, same as lib/stocks.ts: there is
// no sales or customers capability on the backend yet. Swap these bodies for real
// API calls once they exist.
let customers: Customer[] = [
  {
    id: "cus-1",
    name: "Meenakshi Iyer",
    phone: "+91 98410 22311",
    email: "meenakshi.iyer@example.com",
    since: "2026-03-12",
  },
  {
    id: "cus-2",
    name: "Lakshmi Narayanan",
    phone: "+91 99620 44872",
    email: "lakshmi.n@example.com",
    since: "2026-05-02",
  },
  { id: "cus-3", name: "Priya Raman", phone: "+91 97890 10456", since: "2026-06-18" },
  {
    id: "cus-4",
    name: "Deepa Krishnan",
    phone: "+91 98840 77123",
    email: "deepa.k@example.com",
    since: "2026-08-21",
  },
  { id: "cus-5", name: "Anitha Suresh", phone: "+91 90030 55102", since: "2026-10-04" },
];

/** Builds a sample sale line so the seed rows below stay readable. */
function soldLine(
  sku: string,
  productId: string,
  name: string,
  quantity: number,
  unitPrice: number,
  unitCost: number,
  discount = 0,
): SaleLine {
  return { sku, productId, name, unit: "pcs", quantity, unitPrice, unitCost, discount };
}

let sales: Sale[] = [
  {
    id: "sale-1",
    number: "INV-0001",
    date: "2026-09-29",
    customerId: "cus-1",
    customerName: "Meenakshi Iyer",
    lines: [
      soldLine("SKU-SR-1001", "SKU-SR-1001", "Kanchipuram silk saree, maroon", 1, 14500, 11000),
    ],
    subtotal: 14500,
    lineDiscounts: 0,
    billDiscount: 0,
    total: 14500,
    payments: [{ method: "UPI", accountId: "hdfc-current", amount: 14500 }],
  },
  {
    id: "sale-2",
    number: "INV-0002",
    date: "2026-09-29",
    customerName: "Walk-in customer",
    lines: [
      soldLine("SKU-TP-3001-S", "top-block-print", "Block print cotton top - S", 2, 650, 380),
      soldLine(
        "SKU-SW-2001-M",
        "salwar-cotton-set",
        "Cotton salwar set, printed - M",
        1,
        1450,
        950,
      ),
    ],
    subtotal: 2750,
    lineDiscounts: 0,
    billDiscount: 50,
    total: 2700,
    payments: [{ method: "CASH", accountId: "cash-drawer", amount: 2700 }],
  },
  {
    id: "sale-3",
    number: "INV-0003",
    date: "2026-09-30",
    customerId: "cus-2",
    customerName: "Lakshmi Narayanan",
    lines: [
      soldLine(
        "SKU-SR-1002",
        "SKU-SR-1002",
        "Banarasi silk saree, royal blue",
        1,
        16800,
        12800,
        840,
      ),
    ],
    subtotal: 16800,
    lineDiscounts: 840,
    billDiscount: 0,
    total: 15960,
    payments: [{ method: "CARD", accountId: "hdfc-current", amount: 15960 }],
  },
  {
    id: "sale-4",
    number: "INV-0004",
    date: "2026-10-01",
    customerId: "cus-3",
    customerName: "Priya Raman",
    lines: [
      {
        ...soldLine("SKU-SR-1003", "SKU-SR-1003", "Handloom cotton saree, mustard", 2, 3800, 2600),
        returned: 1,
      },
      soldLine("SKU-SW-2003", "SKU-SW-2003", "Palazzo salwar set, mint", 1, 2100, 1400),
    ],
    subtotal: 9700,
    lineDiscounts: 0,
    billDiscount: 700,
    total: 9000,
    payments: [{ method: "BANK_TRANSFER", accountId: "icici-savings", amount: 9000 }],
    returns: [
      {
        id: "sret-1",
        number: "RET-0001",
        date: "2026-10-03",
        reason: "Wrong size or fit",
        note: "Bought for a relative; the length was too short",
        items: [
          {
            sku: "SKU-SR-1003",
            name: "Handloom cotton saree, mustard",
            unit: "pcs",
            quantity: 1,
            unitRefund: 3525.77,
          },
        ],
        value: 3525.77,
        refund: { mode: "money", amount: 3525.77, method: "UPI", accountId: "hdfc-current" },
      },
    ],
  },
  {
    id: "sale-5",
    number: "INV-0005",
    date: "2026-10-02",
    customerName: "Walk-in customer",
    lines: [
      soldLine(
        "SKU-TP-3002-S",
        "top-embroidered-kurti",
        "Embroidered kurti top - S",
        3,
        1250,
        780,
        250,
      ),
    ],
    subtotal: 3750,
    lineDiscounts: 250,
    billDiscount: 0,
    total: 3500,
    payments: [{ method: "CASH", accountId: "cash-drawer", amount: 3500 }],
  },
  {
    id: "sale-6",
    number: "INV-0006",
    date: "2026-10-03",
    customerId: "cus-4",
    customerName: "Deepa Krishnan",
    lines: [soldLine("SKU-SR-1005", "SKU-SR-1005", "Chanderi saree, pastel green", 3, 5200, 3500)],
    subtotal: 15600,
    lineDiscounts: 0,
    billDiscount: 0,
    total: 15600,
    payments: [{ method: "UPI", accountId: "hdfc-current", amount: 15600 }],
  },
  {
    id: "sale-7",
    number: "INV-0007",
    date: "2026-10-04",
    customerName: "Walk-in customer",
    lines: [soldLine("SKU-TP-3003", "SKU-TP-3003", "Linen shirt top, off-white", 2, 990, 600)],
    subtotal: 1980,
    lineDiscounts: 0,
    billDiscount: 0,
    total: 1980,
    payments: [{ method: "CASH", accountId: "cash-drawer", amount: 1980 }],
  },
  {
    id: "sale-8",
    number: "INV-0008",
    date: "2026-10-05",
    customerId: "cus-1",
    customerName: "Meenakshi Iyer",
    lines: [
      soldLine(
        "SKU-SW-2002-M",
        "salwar-anarkali-set",
        "Anarkali salwar set, embroidered - M",
        1,
        3400,
        2300,
      ),
      {
        ...soldLine(
          "SKU-SR-1004",
          "SKU-SR-1004",
          "Georgette party-wear saree, wine",
          1,
          5800,
          4100,
        ),
        returned: 1,
      },
    ],
    subtotal: 9200,
    lineDiscounts: 0,
    billDiscount: 0,
    total: 9200,
    payments: [{ method: "CARD", accountId: "hdfc-current", amount: 9200 }],
    returns: [
      {
        id: "sret-2",
        number: "RET-0002",
        date: "2026-10-05",
        reason: "Changed their mind",
        items: [
          {
            sku: "SKU-SR-1004",
            name: "Georgette party-wear saree, wine",
            unit: "pcs",
            quantity: 1,
            unitRefund: 5800,
          },
        ],
        value: 5800,
        refund: { mode: "credit", amount: 5800 },
      },
    ],
  },
  {
    id: "sale-9",
    number: "INV-0009",
    date: "2026-10-05",
    customerId: "cus-3",
    customerName: "Priya Raman",
    lines: [
      soldLine("SKU-TP-3001-M", "top-block-print", "Block print cotton top - M", 4, 650, 380),
      soldLine(
        "SKU-SW-2001-L",
        "salwar-cotton-set",
        "Cotton salwar set, printed - L",
        2,
        1450,
        950,
      ),
    ],
    subtotal: 5500,
    lineDiscounts: 0,
    billDiscount: 0,
    total: 5500,
    payments: [{ method: "CASH", accountId: "cash-drawer", amount: 2000, tendered: 2000 }],
    dueAmount: 3500,
  },
];

export async function listCustomers(): Promise<Customer[]> {
  return customers;
}

export async function getCustomer(id: string): Promise<Customer | null> {
  return customers.find((customer) => customer.id === id) ?? null;
}

export function addCustomer(
  name: string,
  details: { phone?: string; email?: string } = {},
): Customer {
  const now = new Date();
  const since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const customer: Customer = {
    id: `cus-${Date.now()}`,
    name: name.trim(),
    phone: details.phone?.trim() || undefined,
    email: details.email?.trim().toLowerCase() || undefined,
    since,
  };
  customers = [customer, ...customers];
  return customer;
}

/** Changes a customer's details. Their past sales keep the name they were made under. */
export function editCustomer(
  id: string,
  details: { name: string; phone?: string; email?: string },
): void {
  const before = customers.find((customer) => customer.id === id);
  customers = customers.map((customer) =>
    customer.id === id
      ? {
          ...customer,
          name: details.name.trim(),
          phone: details.phone?.trim() || undefined,
          email: details.email?.trim().toLowerCase() || undefined,
        }
      : customer,
  );
  const after = customers.find((customer) => customer.id === id);
  if (before && after) {
    logAudit({
      action: "updated",
      module: "Customers",
      entity: "Customer",
      label: after.name,
      before: { Name: before.name, Phone: before.phone ?? null, Email: before.email ?? null },
      after: { Name: after.name, Phone: after.phone ?? null, Email: after.email ?? null },
    });
  }
}

export async function listSales(): Promise<Sale[]> {
  return sales;
}

/** Records a completed sale and returns it, numbered after the ones before it. */
export function recordSale(input: Omit<Sale, "id" | "number">): Sale {
  const sale: Sale = {
    ...input,
    id: `sale-${Date.now()}`,
    number: `INV-${String(sales.length + 1).padStart(4, "0")}`,
  };
  sales = [sale, ...sales];
  return sale;
}

/** One thing that can be sold: a simple product, or one variant of a product. */
export interface SellableUnit {
  sku: string;
  productId: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  unit: Unit;
  unitCost?: number;
  /** A catalogue item (a service or the like), not stock. */
  service?: boolean;
  /** Priced for each order, so `price` is 0 until it is typed at the till. */
  customPrice?: boolean;
}

/**
 * Flattens what can be sold into one list: each product or variant of stock, and each
 * catalogue item (a service, priced fixed or per order). A variant is found and added
 * like any product.
 */
export function sellableUnits(
  products: Product[],
  catalogue: CatalogueItem[] = [],
): SellableUnit[] {
  const stock = products.flatMap((product) =>
    product.variants
      ? product.variants.map((variant) => ({
          sku: variant.sku,
          productId: product.id,
          name: `${product.name} - ${variant.name}`,
          category: product.category,
          price: variant.price,
          stock: variant.quantity,
          unit: variant.unit,
          unitCost: variant.purchasePrice || undefined,
        }))
      : [
          {
            sku: product.sku,
            productId: product.id,
            name: product.name,
            category: product.category,
            price: product.price,
            stock: product.quantity,
            unit: product.unit ?? ("pcs" as Unit),
            unitCost: product.purchasePrice || undefined,
          },
        ],
  );
  const services: SellableUnit[] = catalogue.map((item) => ({
    sku: item.id,
    productId: item.id,
    name: item.name,
    category: item.category,
    price: item.pricing === "fixed" ? (item.price ?? 0) : 0,
    // No stock to run out of.
    stock: Number.POSITIVE_INFINITY,
    unit: "pcs",
    // No goods were bought, so the whole price is profit.
    unitCost: 0,
    service: true,
    customPrice: item.pricing === "custom",
  }));
  return [...stock, ...services];
}

/** Every word typed must appear somewhere in the name, SKU or category. */
export function searchUnits(units: SellableUnit[], query: string): SellableUnit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return units.filter((unit) => {
    const haystack = `${unit.name} ${unit.sku} ${unit.category}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export async function getSale(id: string): Promise<Sale | null> {
  return sales.find((sale) => sale.id === id) ?? null;
}

/** What a sale line brought in, after its own discount. */
export function saleLineNet(line: SaleLine): number {
  return round(line.quantity * line.unitPrice - line.discount);
}

/** Profit on a recorded sale: what was kept after refunds, less what the goods that stayed sold cost. */
export function saleProfitOf(sale: Sale): Profit {
  const cost = sale.lines.reduce(
    (sum, line) => sum + (line.unitCost ?? 0) * (line.quantity - (line.returned ?? 0)),
    0,
  );
  return makeProfit(
    sale.total - saleRefundTotal(sale),
    cost,
    sale.lines.every((line) => line.unitCost !== undefined),
  );
}

/** Rupees taken off, across the lines and the bill. */
export function saleDiscountTotal(sale: Sale): number {
  return round(sale.lineDiscounts + sale.billDiscount);
}

/** What each unit of a line is worth to the customer: its price after its own discount and its share of the bill discount. */
export function unitRefundOf(sale: Sale, line: SaleLine): number {
  if (line.quantity <= 0) return 0;
  const afterLines = sale.subtotal - sale.lineDiscounts;
  const billFactor = afterLines > 0 ? (afterLines - sale.billDiscount) / afterLines : 1;
  return round((saleLineNet(line) / line.quantity) * billFactor);
}

/** Units of a line still with the customer, so still returnable. */
export function returnableOf(line: SaleLine): number {
  return Math.max(line.quantity - (line.returned ?? 0), 0);
}

export function canReturnSale(sale: Sale): boolean {
  return sale.lines.some((line) => returnableOf(line) > 0);
}

/** Money and credit given back for this sale. */
export function saleRefundTotal(sale: Sale): number {
  return round((sale.returns ?? []).reduce((sum, ret) => sum + ret.refund.amount, 0));
}

export type SaleStatus = "completed" | "partly_returned" | "returned";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  completed: "Completed",
  partly_returned: "Partly returned",
  returned: "Returned",
};

export function saleStatus(sale: Sale): SaleStatus {
  const returned = sale.lines.reduce((sum, line) => sum + (line.returned ?? 0), 0);
  if (returned === 0) return "completed";
  return canReturnSale(sale) ? "partly_returned" : "returned";
}

/** The next credit slip number, counted across every sale. */
export function nextReturnNumber(): string {
  const count = sales.reduce((sum, sale) => sum + (sale.returns?.length ?? 0), 0);
  return `RET-${String(count + 1).padStart(4, "0")}`;
}

/** Logs a return against a sale and counts its units against the lines. The sale itself stays completed. */
export function recordSaleReturn(saleId: string, ret: SaleReturn): void {
  sales = sales.map((sale) => {
    if (sale.id !== saleId) return sale;
    const lines = sale.lines.map((line) => {
      const back = ret.items.find((entry) => entry.sku === line.sku)?.quantity ?? 0;
      return back > 0 ? { ...line, returned: (line.returned ?? 0) + back } : line;
    });
    return { ...sale, lines, returns: [...(sale.returns ?? []), ret] };
  });
}

// ------------------------------------------------------------------ dues

/** Money a customer paid towards what they owe on account. */
export interface DueCollection {
  id: string;
  customerId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  amount: number;
  method: string;
  /** The account the money went into. */
  accountId: string;
  note?: string;
}

// Sample data standing in for a real capability: the `customer_credit_ledger` in
// docs/db-design.md carries credit sales and payments as signed entries, with no read
// capability on the backend yet.
let collections: DueCollection[] = [
  {
    id: "col-1",
    customerId: "cus-3",
    date: "2026-10-05",
    amount: 500,
    method: "UPI",
    accountId: "hdfc-current",
    note: "Part payment",
  },
];

export async function listCollections(): Promise<DueCollection[]> {
  return collections;
}

/** Records a payment towards a customer's dues. */
export function recordCollection(input: Omit<DueCollection, "id">): DueCollection {
  const collection: DueCollection = { ...input, id: `col-${Date.now()}` };
  collections = [collection, ...collections];
  logAudit({
    action: "created",
    module: "Customers",
    entity: "Payment received",
    label: `${customers.find((customer) => customer.id === input.customerId)?.name ?? "Customer"} · ₹${input.amount}`,
    before: null,
    after: { Amount: `₹${input.amount}`, Date: input.date, Note: input.note ?? null },
  });
  return collection;
}

export interface DueEntry {
  date: string;
  kind: "credit_sale" | "payment";
  reference: string;
  detail: string;
  /** Signed: positive when the customer owes more, negative when they pay some back. */
  amount: number;
}

/** What a customer owes: every credit sale, less every payment they have made since. Newest first. */
export function dueEntries(
  customerSales: Sale[],
  customerCollections: DueCollection[],
): DueEntry[] {
  const owed: DueEntry[] = customerSales
    .filter((sale) => (sale.dueAmount ?? 0) > 0)
    .map((sale) => ({
      date: sale.date,
      kind: "credit_sale" as const,
      reference: sale.number,
      detail: "Left on account",
      amount: sale.dueAmount ?? 0,
    }));
  const paid: DueEntry[] = customerCollections.map((collection) => ({
    date: collection.date,
    kind: "payment" as const,
    reference: collection.id,
    detail: collection.note ?? "Payment received",
    amount: -collection.amount,
  }));
  return [...owed, ...paid].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function dueBalance(entries: DueEntry[]): number {
  return round(entries.reduce((sum, entry) => sum + entry.amount, 0));
}

/** Money taken now across every way a sale was paid. */
export function paidNow(sale: Sale): number {
  return round(sale.payments.reduce((sum, payment) => sum + payment.amount, 0));
}

/** The method codes a sale used, store credit and paying later included. */
export function saleMethods(sale: Sale): string[] {
  return [
    ...sale.payments.map((payment) => payment.method),
    ...((sale.creditUsed ?? 0) > 0 ? ["STORE_CREDIT"] : []),
    ...((sale.dueAmount ?? 0) > 0 ? ["ON_ACCOUNT"] : []),
  ];
}

/** However the sale was paid, in words: "UPI + Cash", "Store credit", "Cash + On account". */
export function salePaymentLabel(sale: Sale): string {
  const methods = Array.from(new Set(saleMethods(sale)));
  return methods.length === 0 ? "-" : methods.map(paymentMethodLabel).join(" + ");
}
