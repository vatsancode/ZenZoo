import type { Expense } from "../features/expenses/expenses";
import { purchaseBalance, type Purchase } from "../features/purchases/purchases";
import { saleLineNet, saleProfitOf, saleRefundTotal, type Sale } from "../features/sales/sales";
import type { Product } from "../features/stocks/stocks";

export interface DateRange {
  /** ISO dates, YYYY-MM-DD, both included. */
  from: string;
  to: string;
}

export const PERIODS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
] as const;

export type PeriodId = (typeof PERIODS)[number]["value"];

const pad = (value: number) => String(value).padStart(2, "0");
const iso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = (value: string) => {
  const [y = 0, m = 1, d = 1] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (value: string, days: number) => {
  const date = parse(value);
  date.setDate(date.getDate() + days);
  return iso(date);
};
const round = (value: number) => Math.round(value * 100) / 100;

export function rangeFor(period: PeriodId): DateRange {
  const today = iso(new Date());
  if (period === "7d") return { from: addDays(today, -6), to: today };
  if (period === "30d") return { from: addDays(today, -29), to: today };
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
}

/** The stretch of the same length straight before `range`, to compare against. */
export function previousRange(range: DateRange): DateRange {
  const days = Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / 86400000) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

const within = (date: string, range: DateRange) => date >= range.from && date <= range.to;

export const salesIn = (sales: Sale[], range: DateRange) =>
  sales.filter((sale) => within(sale.date, range));
export const expensesIn = (expenses: Expense[], range: DateRange) =>
  expenses.filter((expense) => within(expense.date, range));

/** What a sale brought in once refunds are taken off. */
export const kept = (sale: Sale) => round(sale.total - saleRefundTotal(sale));

export interface Totals {
  revenue: number;
  orders: number;
  profit: number;
  expenses: number;
  /** Profit less what was spent. */
  net: number;
}

export function totalsFor(sales: Sale[], expenses: Expense[], range: DateRange): Totals {
  const mine = salesIn(sales, range);
  const revenue = round(mine.reduce((sum, sale) => sum + kept(sale), 0));
  const profit = round(mine.reduce((sum, sale) => sum + saleProfitOf(sale).profit, 0));
  const spent = round(expensesIn(expenses, range).reduce((sum, expense) => sum + expense.total, 0));
  return { revenue, orders: mine.length, profit, expenses: spent, net: round(profit - spent) };
}

/** Change from one figure to another, as a percentage; null when there was nothing to compare to. */
export function changePercent(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}

export interface DayPoint {
  date: string;
  revenue: number;
  orders: number;
}

/** One point per day in the range, with days that had no sales filled in as zero. */
export function dailySeries(sales: Sale[], range: DateRange): DayPoint[] {
  const byDate = new Map<string, DayPoint>();
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    byDate.set(date, { date, revenue: 0, orders: 0 });
  }
  for (const sale of salesIn(sales, range)) {
    const point = byDate.get(sale.date);
    if (point) {
      point.revenue = round(point.revenue + kept(sale));
      point.orders += 1;
    }
  }
  return [...byDate.values()];
}

export interface BarDatum {
  label: string;
  value: number;
  /** A second line of detail for the tooltip. */
  detail?: string;
}

/** Best sellers by what they brought in, after returns. */
export function topProducts(sales: Sale[], range: DateRange, limit = 6): BarDatum[] {
  const totals = new Map<string, { revenue: number; units: number }>();
  for (const sale of salesIn(sales, range)) {
    for (const line of sale.lines) {
      const share = line.quantity > 0 ? (line.quantity - (line.returned ?? 0)) / line.quantity : 0;
      if (share <= 0) continue;
      const entry = totals.get(line.name) ?? { revenue: 0, units: 0 };
      entry.revenue += saleLineNet(line) * share;
      entry.units += line.quantity - (line.returned ?? 0);
      totals.set(line.name, entry);
    }
  }
  return [...totals.entries()]
    .map(([label, entry]) => ({
      label,
      value: round(entry.revenue),
      detail: `${entry.units} ${entry.units === 1 ? "unit" : "units"} sold`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Spending by category, counting each item on a bill, biggest first. */
export function spendingByCategory(expenses: Expense[], range: DateRange, limit = 6): BarDatum[] {
  const totals = new Map<string, number>();
  for (const expense of expensesIn(expenses, range)) {
    for (const line of expense.lines) {
      totals.set(line.category, (totals.get(line.category) ?? 0) + line.amount);
    }
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, limit - 1);
  const tail = sorted.slice(limit - 1);
  const rows = head.map(([label, value]) => ({ label, value: round(value) }));
  // Past the limit, the small ones fold into "Other" rather than crowding the chart.
  if (tail.length === 1) rows.push({ label: tail[0]![0], value: round(tail[0]![1]) });
  if (tail.length > 1) {
    rows.push({
      label: "Everything else",
      value: round(tail.reduce((sum, [, value]) => sum + value, 0)),
    });
  }
  return rows;
}

export interface LowStockItem {
  name: string;
  sku: string;
  quantity: number;
}

export const LOW_STOCK_AT = 10;

/** Stock running low or out, emptiest first. A variant is listed on its own. */
export function lowStock(products: Product[], limit = 6): LowStockItem[] {
  const items: LowStockItem[] = products.flatMap((product) =>
    product.variants
      ? product.variants.map((variant) => ({
          name: `${product.name} - ${variant.name}`,
          sku: variant.sku,
          quantity: variant.quantity,
        }))
      : [{ name: product.name, sku: product.sku, quantity: product.quantity }],
  );
  return items
    .filter((item) => item.quantity <= LOW_STOCK_AT)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, limit);
}

/** What is still owed to vendors across every open purchase. */
export function owedToVendors(purchases: Purchase[]): number {
  return round(
    purchases
      .filter((purchase) => purchase.status !== "cancelled")
      .reduce((sum, purchase) => sum + Math.max(purchaseBalance(purchase), 0), 0),
  );
}

export function shortDate(value: string): string {
  return parse(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export interface RangePreset {
  id: string;
  label: string;
  range: DateRange;
}

/** Quick ranges for the dashboard, worked out fresh so "Today" is always today. */
export function rangePresets(): RangePreset[] {
  const today = iso(new Date());
  const now = new Date();
  return [
    { id: "today", label: "Today", range: { from: today, to: today } },
    {
      id: "yesterday",
      label: "Yesterday",
      range: { from: addDays(today, -1), to: addDays(today, -1) },
    },
    { id: "7d", label: "Last 7 days", range: rangeFor("7d") },
    { id: "30d", label: "Last 30 days", range: rangeFor("30d") },
    { id: "month", label: "This month", range: rangeFor("month") },
    {
      id: "last-month",
      label: "Last month",
      range: {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      },
    },
  ];
}

/** A short name for a range: the preset it matches, or its dates. */
export function describeRange(range: DateRange): string {
  const match = rangePresets().find(
    (preset) => preset.range.from === range.from && preset.range.to === range.to,
  );
  if (match) return match.label;
  const full = (value: string) =>
    parse(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return range.from === range.to
    ? full(range.from)
    : `${shortDate(range.from)} - ${full(range.to)}`;
}

/** The most days the daily chart is asked to draw. */
export const MAX_RANGE_DAYS = 366;

export function rangeDays(range: DateRange): number {
  return Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / 86400000) + 1;
}

export interface CategoryRow {
  name: string;
  units: number;
  revenue: number;
  profit: number;
  /** Profit as a share of revenue, in percent. */
  margin: number;
}

/**
 * What each category sold, earned and made, after returns and every discount. A bill
 * discount is spread over the lines in proportion to what each was worth, so the
 * categories add up to the sales total. Items with no recorded cost count their cost as 0.
 */
export function categoryBreakdown(
  sales: Sale[],
  range: DateRange,
  categoryOf: (productId: string) => string,
): CategoryRow[] {
  const rows = new Map<string, { units: number; revenue: number; cost: number }>();
  for (const sale of salesIn(sales, range)) {
    const afterLines = sale.subtotal - sale.lineDiscounts;
    const billFactor = afterLines > 0 ? (afterLines - sale.billDiscount) / afterLines : 1;
    for (const line of sale.lines) {
      const keptUnits = line.quantity - (line.returned ?? 0);
      if (keptUnits <= 0 || line.quantity <= 0) continue;
      const share = keptUnits / line.quantity;
      const name = categoryOf(line.productId);
      const row = rows.get(name) ?? { units: 0, revenue: 0, cost: 0 };
      row.units += keptUnits;
      row.revenue += saleLineNet(line) * share * billFactor;
      row.cost += (line.unitCost ?? 0) * keptUnits;
      rows.set(name, row);
    }
  }
  return [...rows.entries()]
    .map(([name, row]) => {
      const revenue = round(row.revenue);
      const profit = round(row.revenue - row.cost);
      return {
        name,
        units: row.units,
        revenue,
        profit,
        margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
