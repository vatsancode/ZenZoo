const pad = (value: number) => String(value).padStart(2, "0");

export const isoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
};

export interface DatePreset {
  id: string;
  label: string;
  /** ISO dates, YYYY-MM-DD; "" means no limit on that side. */
  from: string;
  to: string;
}

/** Quick date ranges, worked out fresh each time so "Today" is always today. */
export function datePresets(): DatePreset[] {
  const now = new Date();
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = isoDate(new Date(now.getFullYear(), now.getMonth(), 0));
  return [
    { id: "today", label: "Today", from: daysAgo(0), to: daysAgo(0) },
    { id: "yesterday", label: "Yesterday", from: daysAgo(1), to: daysAgo(1) },
    { id: "week", label: "Last 7 days", from: daysAgo(6), to: daysAgo(0) },
    { id: "month", label: "This month", from: monthStart, to: daysAgo(0) },
    { id: "last-month", label: "Last month", from: lastMonthStart, to: lastMonthEnd },
    { id: "all", label: "All time", from: "", to: "" },
  ];
}
