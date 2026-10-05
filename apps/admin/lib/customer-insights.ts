import { saleLineNet, saleMethods, saleRefundTotal, type Sale } from "./sales";

const round = (value: number) => Math.round(value * 100) / 100;

/** A customer's sales, newest first. */
export function customerSales(sales: Sale[], customerId: string): Sale[] {
  return sales
    .filter((sale) => sale.customerId === customerId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** What they spent, after anything refunded or credited back. */
export function netSpent(sales: Sale[]): number {
  return round(sales.reduce((sum, sale) => sum + sale.total - saleRefundTotal(sale), 0));
}

export interface CreditEntry {
  date: string;
  kind: "issued" | "used";
  /** The return number for credit issued, the invoice number for credit used. */
  reference: string;
  detail: string;
  /** Signed: positive when credit is added to the account, negative when it is spent. */
  amount: number;
}

/**
 * Store credit comes from returns the customer took as credit instead of a refund,
 * and goes down when they spend it on a sale. Newest first.
 */
export function creditEntries(sales: Sale[]): CreditEntry[] {
  const issued: CreditEntry[] = sales.flatMap((sale) =>
    (sale.returns ?? [])
      .filter((ret) => ret.refund.mode === "credit")
      .map((ret) => ({
        date: ret.date,
        kind: "issued" as const,
        reference: ret.number,
        detail: `${ret.reason} · sale ${sale.number}`,
        amount: ret.refund.amount,
      })),
  );
  const used: CreditEntry[] = sales
    .filter((sale) => (sale.creditUsed ?? 0) > 0)
    .map((sale) => ({
      date: sale.date,
      kind: "used" as const,
      reference: sale.number,
      detail: "Spent on a purchase",
      amount: -(sale.creditUsed ?? 0),
    }));
  return [...issued, ...used].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function creditBalance(entries: CreditEntry[]): number {
  return round(entries.reduce((sum, entry) => sum + entry.amount, 0));
}

export interface Preferences {
  /** Where their money goes, biggest first, as a share of what they kept. */
  categories: { name: string; spend: number; share: number }[];
  /** What they buy most, by units kept. */
  items: { name: string; units: number }[];
  /** How they usually pay, most used first. */
  methods: { code: string; count: number; share: number }[];
  /** Discount they usually get, as a percentage of what they were charged before discounts. */
  discountPercent: number;
}

/** What a customer tends to buy and how: worked out from their sales, after returns. */
export function preferencesOf(
  sales: Sale[],
  categoryOf: (productId: string) => string,
): Preferences {
  const spendByCategory = new Map<string, number>();
  const unitsByItem = new Map<string, number>();
  const salesByMethod = new Map<string, number>();
  let discounts = 0;
  let subtotal = 0;

  for (const sale of sales) {
    for (const method of new Set(saleMethods(sale))) {
      salesByMethod.set(method, (salesByMethod.get(method) ?? 0) + 1);
    }
    discounts += sale.lineDiscounts + sale.billDiscount;
    subtotal += sale.subtotal;
    for (const line of sale.lines) {
      const kept = (line.quantity - (line.returned ?? 0)) / line.quantity;
      if (kept <= 0) continue;
      const category = categoryOf(line.productId);
      spendByCategory.set(
        category,
        (spendByCategory.get(category) ?? 0) + saleLineNet(line) * kept,
      );
      unitsByItem.set(
        line.name,
        (unitsByItem.get(line.name) ?? 0) + line.quantity - (line.returned ?? 0),
      );
    }
  }

  const totalSpend = [...spendByCategory.values()].reduce((sum, value) => sum + value, 0);
  return {
    categories: [...spendByCategory.entries()]
      .map(([name, spend]) => ({
        name,
        spend: round(spend),
        share: totalSpend > 0 ? Math.round((spend / totalSpend) * 100) : 0,
      }))
      .sort((a, b) => b.spend - a.spend),
    items: [...unitsByItem.entries()]
      .map(([name, units]) => ({ name, units }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 3),
    methods: [...salesByMethod.entries()]
      .map(([code, count]) => ({ code, count, share: Math.round((count / sales.length) * 100) }))
      .sort((a, b) => b.count - a.count),
    discountPercent: subtotal > 0 ? Math.round((discounts / subtotal) * 1000) / 10 : 0,
  };
}
