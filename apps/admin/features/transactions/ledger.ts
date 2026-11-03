import { apiFetch } from "../../lib/apiFetch";
import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { ensureStoreId } from "../../lib/storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** What moved the money - the same list the server keeps (account_ledger_kind_check). */
export const LEDGER_KIND_LABELS = {
  sale_payment: "Sale",
  customer_payment: "Customer payment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  purchase_payment: "Purchase payment",
  expense_payment: "Expense",
  expense_reversal: "Expense put back",
  sale_refund: "Refund",
  sale_void: "Sale cancelled",
  opening_balance: "Opening balance",
  opening_correction: "Opening corrected",
  starting_balance: "Starting balance",
  other: "Other",
} as const;
export type LedgerKind = keyof typeof LEDGER_KIND_LABELS;

export interface LedgerRow {
  id: string;
  /** When it was recorded (ISO date-time). */
  at: string;
  accountId: string;
  accountName: string;
  kind: LedgerKind;
  /** Money in is positive, money out negative. */
  amount: number;
  balanceAfter: number;
  description: string;
  by: string | null;
  link: { type: "sale" | "purchase" | "customer"; id: string } | null;
}

export interface LedgerPage {
  rows: LedgerRow[];
  total: number;
  moneyIn: number;
  moneyOut: number;
}

export interface LedgerFilters {
  accountId?: string;
  direction?: "in" | "out";
  kind?: LedgerKind;
  /** Days, YYYY-MM-DD, in the shop's own time; "" or left out means no limit. */
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

interface LedgerRowResponse extends Omit<LedgerRow, "amount" | "balanceAfter"> {
  amount: string;
  balanceAfter: string;
}

/** The start of a day here, as the instant the server compares with. */
const startOfDay = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const startOfNextDay = (day: string) => {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
};

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** One page of the money ledger for the current store, newest first - requires "accounts:view". Read-only: nothing here changes a row. */
export async function listLedger(filters: LedgerFilters): Promise<LedgerPage> {
  const storeId = await ensureStoreId();
  const params = new URLSearchParams({
    storeId,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  if (filters.accountId) params.set("accountId", filters.accountId);
  if (filters.direction) params.set("direction", filters.direction);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.from) params.set("from", startOfDay(filters.from));
  if (filters.to) params.set("to", startOfNextDay(filters.to));

  const response = await apiFetch(`${API_URL}/account-ledger?${params.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as {
    rows: LedgerRowResponse[];
    total: number;
    moneyIn: string;
    moneyOut: string;
  };
  return {
    rows: data.rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
      balanceAfter: Number(row.balanceAfter),
    })),
    total: data.total,
    moneyIn: Number(data.moneyIn),
    moneyOut: Number(data.moneyOut),
  };
}
