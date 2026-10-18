/**
 * The dashboard's figures, worked out from plain facts about sales and expenses. Pure functions
 * (no database), so what the dashboard says can be checked without one. Money is in rupees,
 * rounded to two places at the same points the Sales screens round, so a total here always
 * agrees with the sales it is made of.
 */

export interface DateRange {
  /** Shop days, YYYY-MM-DD, both included. */
  from: string;
  to: string;
}

export interface DashboardLine {
  /** "Product" or "Product - Variant". */
  name: string;
  category: string;
  quantity: number;
  /** Units brought back by completed returns. */
  returned: number;
  unitPrice: number;
  /** The line's own discount - not its share of the bill discount. */
  ownDiscount: number;
  /** What all `quantity` units cost to buy, from the batches they came out of. */
  cost: number;
}

export interface DashboardSale {
  /** The shop day it was sold on. */
  day: string;
  total: number;
  /** What was paid back or credited across completed returns. */
  refunded: number;
  subtotal: number;
  /** Discounts on the lines themselves. */
  lineDiscounts: number;
  billDiscount: number;
  lines: DashboardLine[];
}

export interface DashboardExpense {
  day: string;
  total: number;
  lines: { category: string; amount: number }[];
}

export const round = (value: number): number => Math.round(value * 100) / 100;

export function addDays(day: string, days: number): string {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function rangeDays(range: DateRange): number {
  const [fy = 0, fm = 1, fd = 1] = range.from.split("-").map(Number);
  const [ty = 0, tm = 1, td = 1] = range.to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/** The stretch of the same length straight before `range`, to compare against. */
export function previousRange(range: DateRange): DateRange {
  const days = rangeDays(range);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

const within = (day: string, range: DateRange) => day >= range.from && day <= range.to;

const saleLineNet = (line: DashboardLine) =>
  round(line.quantity * line.unitPrice - line.ownDiscount);

/** What a sale brought in once refunds are taken off. */
const kept = (sale: DashboardSale) => round(sale.total - sale.refunded);

/** What was kept after refunds, less what the goods that stayed sold cost. */
function profitOf(sale: DashboardSale): number {
  const cost = sale.lines.reduce(
    (sum, line) =>
      sum + (line.quantity > 0 ? (line.cost / line.quantity) * (line.quantity - line.returned) : 0),
    0,
  );
  return round(sale.total - sale.refunded - cost);
}

export interface Totals {
  revenue: number;
  orders: number;
  profit: number;
  expenses: number;
  /** Profit less what was spent. */
  net: number;
}

export function totalsFor(
  sales: DashboardSale[],
  expenses: DashboardExpense[],
  range: DateRange,
): Totals {
  const mine = sales.filter((sale) => within(sale.day, range));
  const revenue = round(mine.reduce((sum, sale) => sum + kept(sale), 0));
  const profit = round(mine.reduce((sum, sale) => sum + profitOf(sale), 0));
  const spent = round(
    expenses.filter((expense) => within(expense.day, range)).reduce((sum, e) => sum + e.total, 0),
  );
  return { revenue, orders: mine.length, profit, expenses: spent, net: round(profit - spent) };
}

export interface DayPoint {
  date: string;
  revenue: number;
  orders: number;
}

/** One point per day in the range, with days that had no sales filled in as zero. */
export function dailySeries(sales: DashboardSale[], range: DateRange): DayPoint[] {
  const byDate = new Map<string, DayPoint>();
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    byDate.set(date, { date, revenue: 0, orders: 0 });
  }
  for (const sale of sales) {
    const point = byDate.get(sale.day);
    if (point) {
      point.revenue = round(point.revenue + kept(sale));
      point.orders += 1;
    }
  }
  return [...byDate.values()];
}

export interface TopProduct {
  label: string;
  value: number;
  units: number;
}

/** Best sellers by what they brought in, after returns. */
export function topProducts(sales: DashboardSale[], range: DateRange, limit = 6): TopProduct[] {
  const totals = new Map<string, { revenue: number; units: number }>();
  for (const sale of sales.filter((item) => within(item.day, range))) {
    for (const line of sale.lines) {
      const share = line.quantity > 0 ? (line.quantity - line.returned) / line.quantity : 0;
      if (share <= 0) continue;
      const entry = totals.get(line.name) ?? { revenue: 0, units: 0 };
      entry.revenue += saleLineNet(line) * share;
      entry.units += line.quantity - line.returned;
      totals.set(line.name, entry);
    }
  }
  return [...totals.entries()]
    .map(([label, entry]) => ({ label, value: round(entry.revenue), units: entry.units }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface SpendingRow {
  label: string;
  value: number;
}

/** Spending by category, counting each item on a bill, biggest first. */
export function spendingByCategory(
  expenses: DashboardExpense[],
  range: DateRange,
  limit = 6,
): SpendingRow[] {
  const totals = new Map<string, number>();
  for (const expense of expenses.filter((item) => within(item.day, range))) {
    for (const line of expense.lines) {
      totals.set(line.category, (totals.get(line.category) ?? 0) + line.amount);
    }
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, limit - 1);
  const tail = sorted.slice(limit - 1);
  const rows = head.map(([label, value]) => ({ label, value: round(value) }));
  // Past the limit, the small ones fold together rather than crowding the chart.
  if (tail.length === 1) rows.push({ label: tail[0]![0], value: round(tail[0]![1]) });
  if (tail.length > 1) {
    rows.push({
      label: "Everything else",
      value: round(tail.reduce((sum, [, value]) => sum + value, 0)),
    });
  }
  return rows;
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
 * What each category sold, earned and made, after returns and every discount. A bill discount is
 * spread over the lines in proportion to what each was worth, so the categories add up to the
 * sales total.
 */
export function categoryBreakdown(sales: DashboardSale[], range: DateRange): CategoryRow[] {
  const rows = new Map<string, { units: number; revenue: number; cost: number }>();
  for (const sale of sales.filter((item) => within(item.day, range))) {
    const afterLines = sale.subtotal - sale.lineDiscounts;
    const billFactor = afterLines > 0 ? (afterLines - sale.billDiscount) / afterLines : 1;
    for (const line of sale.lines) {
      const keptUnits = line.quantity - line.returned;
      if (keptUnits <= 0 || line.quantity <= 0) continue;
      const share = keptUnits / line.quantity;
      const row = rows.get(line.category) ?? { units: 0, revenue: 0, cost: 0 };
      row.units += keptUnits;
      row.revenue += saleLineNet(line) * share * billFactor;
      row.cost += (line.cost / line.quantity) * keptUnits;
      rows.set(line.category, row);
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

export const LOW_STOCK_AT = 10;

export interface LowStockItem {
  name: string;
  sku: string;
  quantity: number;
}

/** Stock running low or out, emptiest first. */
export function lowStock(items: LowStockItem[], limit = 6): LowStockItem[] {
  return items
    .filter((item) => item.quantity <= LOW_STOCK_AT)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, limit);
}
