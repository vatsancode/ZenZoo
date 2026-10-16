import { paymentMethodLabel } from "../../lib/payment-options";
import {
  parseTypedDiscount,
  priceCart,
  returnValue,
  toPaise,
  toRupees,
  type PriceLineInput,
} from "@zenzoo/pricing";
import type { TillItem } from "../../lib/till";
import type { Unit } from "../stocks/stocks";

export type DiscountType = "amount" | "percent";

/** A line in the cart as the cashier edits it: the discount stays a string while being typed. */
export interface CartLine {
  sku: string;
  /** The SKU people see - `sku` is only the unique key. */
  code?: string | null;
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

export type { Customer } from "../../lib/customers";
export { getSale, listSales } from "../../lib/sales";
export { listCollections } from "../../lib/customers";

export interface SaleLine {
  /** The sale line's own id - what a return names. */
  id?: string;
  /** What the customer paid for the whole line (after discounts), exactly as the server has it. */
  lineTotal?: number;
  /** A key that is always unique (the variant's id) - not shown to people; see `code`. */
  sku: string;
  /** The SKU people see and scan, when the item has one. */
  code?: string | null;
  category?: string;
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
  /** Cancelled: the sale stays on record (and keeps its number) but counts for nothing. */
  voided?: boolean;
  voidReason?: string;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The till's money maths lives in @zenzoo/pricing (integer paise, shared with the server and the
 * native POS). These wrappers only translate the cart's rupee figures and typed discount boxes
 * to and from it, so the screens keep working in rupees.
 */
const lineInput = (line: CartLine): PriceLineInput => ({
  unitPrice: toPaise(line.unitPrice),
  quantity: line.quantity,
  discount: parseTypedDiscount(line.discountValue, line.discountType),
});

export function lineGross(line: CartLine): number {
  return toRupees(priceCart({ lines: [lineInput(line)] }).subtotal);
}

/** Rupees taken off this line by its own discount box (not its share of the bill discount). */
export function lineDiscount(line: CartLine): number {
  return toRupees(priceCart({ lines: [lineInput(line)] }).lineDiscounts);
}

export function lineNet(line: CartLine): number {
  return toRupees(priceCart({ lines: [lineInput(line)] }).total);
}

/** The bill discount comes off what is left after each line's own discount. */
export function cartTotals(lines: CartLine[], billTyped: string, billType: DiscountType) {
  const cart = priceCart({
    lines: lines.map(lineInput),
    billDiscount: parseTypedDiscount(billTyped, billType),
  });
  return {
    subtotal: toRupees(cart.subtotal),
    lineDiscounts: toRupees(cart.lineDiscounts),
    billDiscount: toRupees(cart.billDiscount),
    total: toRupees(cart.total),
  };
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

/** One thing that can be sold: a simple product, or one variant of a product. */
export interface SellableUnit {
  sku: string;
  /** The SKU shown and scanned, when the item has one - `sku` above is only a unique key. */
  code?: string | null;
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
 * The till's item list, from the real catalogue: one unit per variant. `sku` is the
 * variant id - unique, so it keys the cart even when a variant has no SKU of its own;
 * `code` is the SKU people actually see and scan.
 */
export function tillUnits(items: TillItem[]): SellableUnit[] {
  return items.map((item) => {
    const service = item.kind === "made_to_order";
    return {
      sku: item.variantId,
      code: item.sku,
      productId: item.sellableId,
      name: item.name,
      category: item.categoryName,
      price: item.customPrice ? 0 : Number(item.price),
      // Made-to-order items aren't counted, so they never run out.
      stock: item.onHand ?? Number.POSITIVE_INFINITY,
      unit: item.unit,
      // No goods were bought for a made-to-order item, so the whole price is profit.
      unitCost: service ? 0 : item.nextUnitCost === null ? undefined : Number(item.nextUnitCost),
      service,
      customPrice: item.customPrice,
    };
  });
}

/** Every word typed must appear somewhere in the name, SKU or category. */
export function searchUnits(units: SellableUnit[], query: string): SellableUnit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return units.filter((unit) => {
    const haystack = `${unit.name} ${unit.code ?? ""} ${unit.category}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** What a sale line brought in, after its own discount. */
export function saleLineNet(line: SaleLine): number {
  return round(line.quantity * line.unitPrice - line.discount);
}

/** Profit on a recorded sale: what was kept after refunds, less what the goods that stayed sold cost. */
export function saleProfitOf(sale: Sale): Profit {
  // A cancelled sale never happened: no revenue and no cost.
  if (sale.voided) return makeProfit(0, 0, true);
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

/**
 * Units of a line still with the customer, so still returnable. A made-to-order item (a service)
 * has no stock to put back, so it is never returnable - cancel the sale instead.
 */
export function returnableOf(line: SaleLine): number {
  if (line.service) return 0;
  return Math.max(line.quantity - (line.returned ?? 0), 0);
}

export function canReturnSale(sale: Sale): boolean {
  return !sale.voided && sale.lines.some((line) => returnableOf(line) > 0);
}

/**
 * What coming back is worth: `quantity` more units of a line, given what has already been
 * returned - the same shared maths the server uses, so the figure shown is the figure paid.
 */
export function returnValueOf(line: SaleLine, quantity: number): number {
  const total = line.lineTotal ?? saleLineNet(line);
  return toRupees(returnValue(toPaise(total), line.quantity, line.returned ?? 0, quantity));
}

/** Money and credit given back for this sale. */
export function saleRefundTotal(sale: Sale): number {
  return round((sale.returns ?? []).reduce((sum, ret) => sum + ret.refund.amount, 0));
}

export type SaleStatus = "completed" | "partly_returned" | "returned" | "voided";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  completed: "Completed",
  partly_returned: "Partly returned",
  returned: "Returned",
  voided: "Cancelled",
};

export function saleStatus(sale: Sale): SaleStatus {
  if (sale.voided) return "voided";
  const returned = sale.lines.reduce((sum, line) => sum + (line.returned ?? 0), 0);
  if (returned === 0) return "completed";
  return canReturnSale(sale) ? "partly_returned" : "returned";
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
