/**
 * The dashboard's date ranges and the shapes the screen draws. The figures themselves are worked
 * out by the server (getDashboard), so the dashboard shows what the books say and needs only the
 * Dashboard permission - nothing is added up here.
 */

export interface DateRange {
  /** ISO dates, YYYY-MM-DD, both included. */
  from: string;
  to: string;
}

export interface DayPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface BarDatum {
  label: string;
  value: number;
  /** A second line of detail for the tooltip. */
  detail?: string;
}

export interface CategoryRow {
  name: string;
  units: number;
  revenue: number;
  profit: number;
  /** Profit as a share of revenue, in percent. */
  margin: number;
}

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

export type PeriodId = "7d" | "30d" | "month";

export function rangeFor(period: PeriodId): DateRange {
  const today = iso(new Date());
  if (period === "7d") return { from: addDays(today, -6), to: today };
  if (period === "30d") return { from: addDays(today, -29), to: today };
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
}

/** Change from one figure to another, as a percentage; null when there was nothing to compare to. */
export function changePercent(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
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
