"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Card, textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  accountMovements,
  balanceOf,
  listAccounts,
  type Account,
  type Movement,
} from "../features/settings/accounts";
import {
  categoryBreakdown,
  changePercent,
  dailySeries,
  expensesIn,
  lowStock,
  LOW_STOCK_AT,
  owedToVendors,
  describeRange,
  previousRange,
  rangeFor,
  salesIn,
  shortDate,
  spendingByCategory,
  topProducts,
  totalsFor,
  type DateRange,
} from "../lib/dashboard";
import { listCatalogueItems, type CatalogueItem } from "../lib/catalogue-items";
import { listExpenses, type Expense } from "../features/expenses/expenses";
import { listPurchases, type Purchase } from "../features/purchases/purchases";
import { listCollections, listSales, type DueCollection, type Sale } from "../features/sales/sales";
import { formatPrice } from "../lib/stock-display";
import { listProducts, type Product } from "../features/stocks/stocks";
import BarList from "./BarList";
import CategoryBreakdownCard from "./CategoryBreakdownCard";
import DateRangePicker from "./DateRangePicker";
import StatTile, { StatRow } from "./StatTile";
import TrendChart from "./TrendChart";

function CardHeader({
  title,
  hint,
  href,
  linkText,
}: {
  title: string;
  hint?: string;
  href?: string;
  linkText?: string;
}) {
  const { colors, spacing } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: spacing[4],
        marginBottom: spacing[5],
      }}
    >
      <div>
        <div style={{ ...textStyle("headline"), color: colors.ink }}>{title}</div>
        {hint ? (
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            {hint}
          </div>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          style={{ ...textStyle("bodyMedium"), color: colors.accent, textDecoration: "none" }}
        >
          {linkText ?? "View all"}
        </Link>
      ) : null}
    </div>
  );
}

/** Where the business stands: the figures that matter, how sales are moving, and what needs attention. */
export default function DashboardScreen() {
  const { colors, radius, spacing } = useTheme();
  const [range, setRange] = useState<DateRange>(() => rangeFor("7d"));
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [collections, setCollections] = useState<DueCollection[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const [s, e, p, pu, a, m, c, col] = await Promise.all([
        listSales(),
        listExpenses(),
        listProducts(),
        listPurchases(),
        listAccounts(),
        accountMovements(),
        listCatalogueItems(),
        listCollections(),
      ]);
      setSales([...s]);
      setCollections([...col]);
      setExpenses([...e]);
      setProducts([...p]);
      setPurchases([...pu]);
      setAccounts([...a]);
      setMovements(m);
      setCatalogue([...c]);
      setLoaded(true);
    }
    void load();
  }, []);

  const before = useMemo(() => previousRange(range), [range]);
  const now = useMemo(() => totalsFor(sales, expenses, range), [sales, expenses, range]);
  const prior = useMemo(() => totalsFor(sales, expenses, before), [sales, expenses, before]);
  const series = useMemo(() => dailySeries(sales, range), [sales, range]);
  const categories = useMemo(() => {
    const byProduct = new Map<string, string>([
      ...products.map((product) => [product.id, product.category] as const),
      ...catalogue.map((item) => [item.id, item.category] as const),
    ]);
    return categoryBreakdown(sales, range, (productId) => byProduct.get(productId) ?? "Other");
  }, [sales, range, products, catalogue]);
  const best = useMemo(() => topProducts(sales, range), [sales, range]);
  const spending = useMemo(() => spendingByCategory(expenses, range), [expenses, range]);
  const lows = useMemo(() => lowStock(products), [products]);
  const recent = useMemo(
    () => [...sales].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5),
    [sales],
  );
  // Credit sales across everyone, less every payment collected since.
  const toCollect = useMemo(
    () =>
      Math.max(
        0,
        sales.reduce((sum, sale) => sum + (sale.dueAmount ?? 0), 0) -
          collections.reduce((sum, item) => sum + item.amount, 0),
      ),
    [sales, collections],
  );
  const owed = useMemo(() => owedToVendors(purchases), [purchases]);
  const cash = accounts.reduce((sum, account) => sum + balanceOf(account, movements), 0);
  const periodLabel = describeRange(range).toLowerCase();

  /** "▲ 12.4% vs the 7 days before", coloured by whether the change is good. */
  const delta = (current: number, previous: number, upIsGood = true): ReactNode => {
    const change = changePercent(current, previous);
    if (change === null) return "Nothing to compare with";
    const good = upIsGood ? change >= 0 : change <= 0;
    return (
      <span>
        <span
          style={{ color: change === 0 ? colors.inkMuted : good ? colors.success : colors.danger }}
        >
          {change > 0 ? "▲" : change < 0 ? "▼" : "-"} {Math.abs(change)}%
        </span>
        {" vs the period before"}
      </span>
    );
  };

  const hasSales = salesIn(sales, range).length > 0;
  const spentInRange = expensesIn(expenses, range).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[4],
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ ...textStyle("title1"), margin: 0 }}>Dashboard</h1>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <StatRow>
        <StatTile
          label="Revenue"
          value={formatPrice(now.revenue)}
          hint={delta(now.revenue, prior.revenue)}
        />
        <StatTile
          label="Profit"
          value={formatPrice(now.profit)}
          hint={delta(now.profit, prior.profit)}
        />
        <StatTile
          label="Expenses"
          value={formatPrice(now.expenses)}
          hint={delta(now.expenses, prior.expenses, false)}
        />
        <StatTile
          label="Net profit"
          value={formatPrice(now.net)}
          hint={now.net >= 0 ? "Profit after expenses" : "Spending is above profit"}
        />
        <StatTile label="Sales" value={String(now.orders)} hint={delta(now.orders, prior.orders)} />
        <StatTile
          label="To collect"
          value={formatPrice(toCollect)}
          hint={toCollect > 0 ? "Owed by customers" : "Nothing due"}
        />
        <StatTile
          label="Owed to vendors"
          value={formatPrice(owed)}
          hint={owed > 0 ? "Open purchases" : "Nothing owed"}
        />
      </StatRow>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
          gap: spacing[6],
          alignItems: "stretch",
        }}
      >
        <Card>
          <CardHeader
            title="Revenue"
            hint={`Daily, ${shortDate(range.from)} to ${shortDate(range.to)}`}
            href="/sales"
          />
          {loaded && hasSales ? (
            <TrendChart data={series} />
          ) : (
            <div
              style={{
                ...textStyle("callout"),
                color: colors.inkMuted,
                padding: `${spacing[10]}px 0`,
              }}
            >
              {loaded ? `No sales in ${periodLabel}.` : "Loading..."}
            </div>
          )}
        </Card>

        <Card style={{ display: "flex", flexDirection: "column" }}>
          <CardHeader
            title="Money in your accounts"
            href="/settings/transfers"
            linkText="Transfer"
          />
          <div style={{ ...textStyle("title1"), color: colors.ink }}>{formatPrice(cash)}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: spacing[5] }}>
            {accounts.map((account, index) => (
              <div
                key={account.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: spacing[4],
                  padding: `${spacing[3]}px 0`,
                  borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <span style={{ ...textStyle("body"), color: colors.ink }}>{account.name}</span>
                <span style={{ ...textStyle("data"), color: colors.ink }}>
                  {formatPrice(balanceOf(account, movements))}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <CategoryBreakdownCard rows={categories} periodLabel={periodLabel} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: spacing[6],
          alignItems: "stretch",
        }}
      >
        <Card>
          <CardHeader title="Top products" hint={`By revenue, ${periodLabel}`} href="/sales" />
          <BarList data={best} emptyText={`Nothing sold in ${periodLabel}.`} />
        </Card>
        <Card>
          <CardHeader
            title="Where the money goes"
            hint={`Expenses by category, ${periodLabel}`}
            href="/expenses"
          />
          <BarList
            data={spending}
            emptyText={spentInRange === 0 ? `No expenses in ${periodLabel}.` : "Nothing to show."}
          />
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: spacing[6],
          alignItems: "stretch",
        }}
      >
        <Card>
          <CardHeader
            title="Running low"
            hint={`${LOW_STOCK_AT} or fewer left`}
            href="/stocks"
            linkText="Stocks"
          />
          {lows.length === 0 ? (
            <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
              Everything is well stocked.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {lows.map((item, index) => (
                <div
                  key={item.sku}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing[4],
                    minHeight: 56,
                    borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...textStyle("body"), color: colors.ink }}>{item.name}</div>
                    <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                      {item.sku}
                    </div>
                  </div>
                  <Badge tone={item.quantity === 0 ? "danger" : "warning"}>
                    {item.quantity === 0 ? "Out of stock" : `${item.quantity} left`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent sales" href="/sales" />
          {recent.length === 0 ? (
            <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>No sales yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recent.map((sale, index) => (
                <Link
                  key={sale.id}
                  href={`/sales/${encodeURIComponent(sale.id)}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing[4],
                    minHeight: 56,
                    borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                    borderBottom: `1px solid ${colors.border}`,
                    color: colors.ink,
                    textDecoration: "none",
                    borderRadius: radius.sm,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...textStyle("body"), color: colors.ink }}>
                      {sale.customerName}
                    </div>
                    <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      <span style={textStyle("dataSmall")}>{sale.number}</span> ·{" "}
                      {shortDate(sale.date)}
                    </div>
                  </div>
                  <span style={{ ...textStyle("data"), color: colors.ink }}>
                    {formatPrice(sale.total)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
