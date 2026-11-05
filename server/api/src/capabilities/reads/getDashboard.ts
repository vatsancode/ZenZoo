import { UserFacingError } from "../../shared/errors";
import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import {
  addDays,
  categoryBreakdown,
  dailySeries,
  LOW_STOCK_AT,
  lowStock,
  previousRange,
  rangeDays,
  round,
  spendingByCategory,
  topProducts,
  totalsFor,
  type CategoryRow,
  type DashboardExpense,
  type DashboardSale,
  type DateRange,
  type DayPoint,
  type LowStockItem,
  type SpendingRow,
  type TopProduct,
  type Totals,
} from "../dashboard/metrics";
import { addQuantities, toQuantity, toThousandths } from "../../shared/quantity";

export interface GetDashboardInput {
  storeId: string;
  /** Shop days, YYYY-MM-DD, both included. */
  from: string;
  to: string;
  /** The shop's time zone (an IANA name like Asia/Kolkata), so a sale lands on the day the shop saw it. Defaults to UTC. */
  timeZone?: string;
}

export interface DashboardDto {
  range: DateRange;
  previousRange: DateRange;
  totals: Totals;
  /** The same figures for the stretch of equal length just before, to compare against. */
  previous: Totals;
  series: DayPoint[];
  categories: CategoryRow[];
  topProducts: TopProduct[];
  spending: SpendingRow[];
  /** Expense bills in the range - tells "no expenses" apart from "nothing to show". */
  expenseCount: number;
  lowStock: LowStockItem[];
  /** The quantity at or under which a variant is listed as running low. */
  lowStockAt: number;
  /** What customers owe the shop right now, from their account ledgers. */
  toCollect: number;
  /** What is still unpaid on placed and received purchases. */
  owedToVendors: number;
  accounts: { id: string; name: string; balance: number }[];
  recentSales: {
    id: string;
    number: string | null;
    customerName: string | null;
    day: string;
    total: number;
  }[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

function validDay(value: string, name: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !DAY.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new UserFacingError(`"${name}" must be a date like 2026-10-15.`);
  }
}

/** The shop day (YYYY-MM-DD) a moment falls on in `timeZone`. */
function dayFormatter(timeZone: string): (at: Date) => string {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new UserFacingError(`"${timeZone}" isn't a time zone I know.`);
  }
  return (at) => formatter.format(at);
}

const num = (value: { toNumber(): number }) => value.toNumber();

/**
 * Everything the dashboard shows, worked out here from the shop's own records - so the screen
 * needs "dashboard:view" and nothing else, rather than borrowing Sales, Expenses, Stocks,
 * Purchases, Customers and Settings one by one. What each figure means lives in
 * ../dashboard/metrics; this only fetches the facts those functions need.
 *
 * Sales and expenses are read for the range and the stretch before it (for the comparison).
 */
export const getDashboard = defineCapability<GetDashboardInput, DashboardDto>({
  name: "getDashboard",
  kind: "read",
  description:
    "A summary of how one store is doing between two days: revenue, number of orders, profit, expenses and net for the range, the same figures for the equal stretch just before it, a daily revenue series, sales by category, top products, spending by category, items running low on stock (at 10 units or fewer, with name and quantity), what customers owe the shop, what the shop owes vendors, account balances and the most recent sales. Get storeId from listStores. from and to are shop days (YYYY-MM-DD, both included, at most 366 days apart): for today pass today's date as both. Pass timeZone as the shop's time zone, such as Asia/Kolkata, or days are worked out in UTC. All money figures here are plain numbers in rupees.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
    from: z.string().describe("First day, YYYY-MM-DD."),
    to: z.string().describe("Last day, YYYY-MM-DD (included)."),
    timeZone: z.string().optional().describe("The shop's time zone, such as Asia/Kolkata."),
  }),
  requiredPermission: "dashboard:view",
  async handler(actor, input) {
    validDay(input.from, "from");
    validDay(input.to, "to");
    if (input.from > input.to) throw new UserFacingError("The start date is after the end date.");
    const range: DateRange = { from: input.from, to: input.to };
    if (rangeDays(range) > MAX_DAYS) throw new UserFacingError(`Pick ${MAX_DAYS} days or fewer.`);
    const before = previousRange(range);
    const dayOf = dayFormatter(input.timeZone ?? "UTC");
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const tenant_id = actor.tenantId;
      const store_id = input.storeId;

      // Padded by a day each side, then cut to the range by the shop's own calendar.
      const saleRows = await tx.sales.findMany({
        where: {
          tenant_id,
          store_id,
          status: "completed",
          sold_at: {
            gte: new Date(`${addDays(before.from, -1)}T00:00:00.000Z`),
            lt: new Date(`${addDays(range.to, 2)}T00:00:00.000Z`),
          },
        },
        select: {
          sold_at: true,
          subtotal_amount: true,
          discount_amount: true,
          bill_discount_amount: true,
          total_amount: true,
          sale_returns: {
            where: { status: "completed" },
            select: {
              refund_amount: true,
              sale_return_items: { select: { sale_item_id: true, quantity: true } },
            },
          },
          sale_items: {
            select: {
              id: true,
              quantity: true,
              unit_price: true,
              discount_amount: true,
              bill_discount_share: true,
              variants: {
                select: {
                  name: true,
                  sellables: { select: { name: true, categories: { select: { name: true } } } },
                },
              },
              sale_item_batches: {
                select: { quantity: true, inventory_batches: { select: { unit_cost: true } } },
              },
            },
          },
        },
      });

      const sales: DashboardSale[] = saleRows
        .map((sale) => {
          const returnedByItem = new Map<string, number>();
          for (const ret of sale.sale_returns) {
            for (const item of ret.sale_return_items) {
              returnedByItem.set(
                item.sale_item_id,
                addQuantities(
                  returnedByItem.get(item.sale_item_id) ?? 0,
                  toQuantity(item.quantity),
                ),
              );
            }
          }
          const billDiscount = num(sale.bill_discount_amount);
          return {
            day: dayOf(sale.sold_at),
            total: num(sale.total_amount),
            refunded: round(
              sale.sale_returns.reduce((sum, ret) => sum + num(ret.refund_amount), 0),
            ),
            subtotal: num(sale.subtotal_amount),
            lineDiscounts: round(num(sale.discount_amount) - billDiscount),
            billDiscount,
            lines: sale.sale_items.map((item) => {
              const product = item.variants.sellables.name;
              // In paise so several batches add up exactly.
              const costPaise = item.sale_item_batches.reduce(
                (sum, part) =>
                  sum +
                  Math.round(
                    (toThousandths(toQuantity(part.quantity)) *
                      Math.round(num(part.inventory_batches.unit_cost) * 100)) /
                      1000,
                  ),
                0,
              );
              return {
                name:
                  item.variants.name === product ? product : `${product} - ${item.variants.name}`,
                category: item.variants.sellables.categories.name,
                quantity: toQuantity(item.quantity),
                returned: returnedByItem.get(item.id) ?? 0,
                unitPrice: num(item.unit_price),
                ownDiscount: round(num(item.discount_amount) - num(item.bill_discount_share)),
                cost: costPaise / 100,
              };
            }),
          };
        })
        .filter((sale) => sale.day >= before.from && sale.day <= range.to);

      const expenseRows = await tx.expenses.findMany({
        where: {
          tenant_id,
          store_id,
          expense_date: {
            gte: new Date(`${before.from}T00:00:00.000Z`),
            lte: new Date(`${range.to}T00:00:00.000Z`),
          },
        },
        select: {
          expense_date: true,
          total: true,
          expense_lines: {
            select: { amount: true, expense_categories: { select: { name: true } } },
          },
        },
      });
      const expenses: DashboardExpense[] = expenseRows.map((expense) => ({
        day: expense.expense_date.toISOString().slice(0, 10),
        total: num(expense.total),
        lines: expense.expense_lines.map((line) => ({
          category: line.expense_categories.name,
          amount: num(line.amount),
        })),
      }));

      // Stock on hand per variant, as listCurrentStock reads it (a variant with no batches has none).
      const [products, onHandRows] = await Promise.all([
        tx.sellables.findMany({
          where: { tenant_id, store_id, kind: "product", status: "active" },
          select: {
            name: true,
            variants: { where: { status: "active" }, select: { id: true, name: true, sku: true } },
          },
        }),
        tx.inventory_batches.groupBy({
          by: ["variant_id"],
          where: { tenant_id, store_id },
          _sum: { available_quantity: true },
        }),
      ]);
      const onHand = new Map(
        onHandRows.map((row) => [row.variant_id, toQuantity(row._sum.available_quantity)]),
      );
      const stockItems: LowStockItem[] = products.flatMap((product) =>
        product.variants.map((variant) => ({
          name: variant.name === product.name ? product.name : `${product.name} - ${variant.name}`,
          sku: variant.sku ?? "",
          quantity: onHand.get(variant.id) ?? 0,
        })),
      );

      // What customers owe: the positive balances in their append-only ledgers.
      const ledger = await tx.customer_credit_ledger.groupBy({
        by: ["customer_id"],
        where: { tenant_id },
        _sum: { amount: true },
      });
      const toCollect = round(
        ledger.reduce((sum, row) => {
          const balance = row._sum.amount ? Number(row._sum.amount.toString()) : 0;
          return balance > 0 ? sum + balance : sum;
        }, 0),
      );

      const openPurchases = await tx.purchases.findMany({
        where: { tenant_id, store_id, status: { in: ["ordered", "received"] } },
        select: { total_amount: true, purchase_payments: { select: { amount: true } } },
      });
      const owedToVendors = round(
        openPurchases.reduce((sum, purchase) => {
          const paid = purchase.purchase_payments.reduce(
            (paidSum, p) => paidSum + num(p.amount),
            0,
          );
          return sum + Math.max(num(purchase.total_amount) - paid, 0);
        }, 0),
      );

      const accountRows = await tx.payment_accounts.findMany({
        where: { tenant_id, store_id },
        orderBy: { created_at: "asc" },
        select: { id: true, name: true, balance: true },
      });

      const recent = await tx.sales.findMany({
        where: { tenant_id, store_id, status: "completed" },
        orderBy: [{ sold_at: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          id: true,
          sale_number: true,
          sold_at: true,
          total_amount: true,
          customers: { select: { name: true } },
        },
      });

      return {
        range,
        previousRange: before,
        totals: totalsFor(sales, expenses, range),
        previous: totalsFor(sales, expenses, before),
        series: dailySeries(
          sales.filter((sale) => sale.day >= range.from && sale.day <= range.to),
          range,
        ),
        categories: categoryBreakdown(sales, range),
        topProducts: topProducts(sales, range),
        spending: spendingByCategory(expenses, range),
        expenseCount: expenses.filter((e) => e.day >= range.from && e.day <= range.to).length,
        lowStock: lowStock(stockItems),
        lowStockAt: LOW_STOCK_AT,
        toCollect,
        owedToVendors,
        accounts: accountRows.map((row) => ({
          id: row.id,
          name: row.name,
          balance: num(row.balance),
        })),
        recentSales: recent.map((sale) => ({
          id: sale.id,
          number: sale.sale_number,
          customerName: sale.customers?.name ?? null,
          day: dayOf(sale.sold_at),
          total: num(sale.total_amount),
        })),
      };
    });
  },
});
