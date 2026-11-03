import { redirectToSignInIfUnauthorized } from "./auth";
import { ensureStoreId } from "./storeContext";
import type { CategoryRow, DateRange, DayPoint } from "./dashboard";
import { apiFetch } from "./apiFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface DashboardTotals {
  revenue: number;
  orders: number;
  profit: number;
  expenses: number;
  /** Profit less what was spent. */
  net: number;
}

/** The server's DashboardDto (server/api/src/capabilities/reads/getDashboard.ts). Money is in rupees. */
export interface Dashboard {
  range: DateRange;
  previousRange: DateRange;
  totals: DashboardTotals;
  /** The same figures for the stretch of equal length just before. */
  previous: DashboardTotals;
  series: DayPoint[];
  categories: CategoryRow[];
  topProducts: { label: string; value: number; units: number }[];
  spending: { label: string; value: number }[];
  expenseCount: number;
  lowStock: { name: string; sku: string; quantity: number }[];
  lowStockAt: number;
  toCollect: number;
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

/**
 * Everything the dashboard shows for a range - requires "dashboard:view" and nothing else. Days
 * are the shop's own, in this device's time zone.
 */
export async function getDashboard(range: DateRange): Promise<Dashboard> {
  const storeId = await ensureStoreId();
  const query = new URLSearchParams({
    storeId,
    from: range.from,
    to: range.to,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const response = await apiFetch(`${API_URL}/dashboard?${query}`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    let message = "Couldn't load the dashboard.";
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      // keep the plain message
    }
    throw new Error(message);
  }
  return (await response.json()) as Dashboard;
}
