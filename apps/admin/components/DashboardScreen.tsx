"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Card, textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useAccess } from "../lib/access";
import {
  changePercent,
  describeRange,
  rangeFor,
  shortDate,
  type DateRange,
} from "../lib/dashboard";
import { getDashboard, type Dashboard } from "../lib/dashboardApi";
import { formatPrice } from "../lib/stock-display";
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
  const { canOpen } = useAccess();
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
      {href && canOpen(href) ? (
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
  const { canOpen } = useAccess();
  const [range, setRange] = useState<DateRange>(() => rangeFor("7d"));
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Everything comes from one read, worked out by the server - see getDashboard.
  useEffect(() => {
    let current = true;
    setError(null);
    getDashboard(range)
      .then((next) => {
        if (current) setData(next);
      })
      .catch((reason: unknown) => {
        if (current)
          setError(reason instanceof Error ? reason.message : "Couldn't load the dashboard.");
      });
    return () => {
      current = false;
    };
  }, [range]);

  // The figures on screen belong to the range they were asked for; until the new ones arrive, say so.
  const loaded = data !== null && data.range.from === range.from && data.range.to === range.to;
  const none = { revenue: 0, orders: 0, profit: 0, expenses: 0, net: 0 };
  const now = data?.totals ?? none;
  const prior = data?.previous ?? none;
  const cash = (data?.accounts ?? []).reduce((sum, account) => sum + account.balance, 0);
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

  const hasSales = now.orders > 0;

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

      {error ? (
        <div role="alert" style={{ ...textStyle("callout"), color: colors.danger }}>
          {error}
        </div>
      ) : null}

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
          value={formatPrice(data?.toCollect ?? 0)}
          hint={(data?.toCollect ?? 0) > 0 ? "Owed by customers" : "Nothing due"}
        />
        <StatTile
          label="Owed to vendors"
          value={formatPrice(data?.owedToVendors ?? 0)}
          hint={(data?.owedToVendors ?? 0) > 0 ? "Unpaid purchases" : "Nothing owed"}
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
            <TrendChart data={data?.series ?? []} />
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
            {(data?.accounts ?? []).map((account, index) => (
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
                  {formatPrice(account.balance)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <CategoryBreakdownCard rows={data?.categories ?? []} periodLabel={periodLabel} />

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
          <BarList
            data={(data?.topProducts ?? []).map((item) => ({
              label: item.label,
              value: item.value,
              detail: `${item.units} ${item.units === 1 ? "unit" : "units"} sold`,
            }))}
            emptyText={`Nothing sold in ${periodLabel}.`}
          />
        </Card>
        <Card>
          <CardHeader
            title="Where the money goes"
            hint={`Expenses by category, ${periodLabel}`}
            href="/expenses"
          />
          <BarList
            data={data?.spending ?? []}
            emptyText={
              (data?.expenseCount ?? 0) === 0
                ? `No expenses in ${periodLabel}.`
                : "Nothing to show."
            }
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
            hint={`${data?.lowStockAt ?? 10} or fewer left`}
            href="/stocks"
            linkText="Stocks"
          />
          {(data?.lowStock ?? []).length === 0 ? (
            <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
              Everything is well stocked.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {(data?.lowStock ?? []).map((item, index) => (
                <div
                  key={`${item.name}-${item.sku}`}
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
          {(data?.recentSales ?? []).length === 0 ? (
            <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>No sales yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {(data?.recentSales ?? []).map((sale, index) => {
                const rowStyle = {
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
                } as const;
                const row = (
                  <>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...textStyle("body"), color: colors.ink }}>
                        {sale.customerName ?? "Walk-in customer"}
                      </div>
                      <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                        <span style={textStyle("dataSmall")}>{sale.number}</span> ·{" "}
                        {shortDate(sale.day)}
                      </div>
                    </div>
                    <span style={{ ...textStyle("data"), color: colors.ink }}>
                      {formatPrice(sale.total)}
                    </span>
                  </>
                );
                // The sale itself is a Sales page - only a role that has Sales gets the link.
                return canOpen("/sales") ? (
                  <Link
                    key={sale.id}
                    href={`/sales/${encodeURIComponent(sale.id)}`}
                    style={rowStyle}
                  >
                    {row}
                  </Link>
                ) : (
                  <div key={sale.id} style={rowStyle}>
                    {row}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
