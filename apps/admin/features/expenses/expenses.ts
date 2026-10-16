import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { logAudit } from "../../lib/audit";
import { accountLabel } from "../../lib/payment-options";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { ensureStoreId } from "../../lib/storeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** One thing paid for on a bill: what it was, which category it belongs to, and what it cost. */
export interface ExpenseLine {
  description: string;
  /** The category's name, as shown. */
  category: string;
  categoryId: string;
  amount: number;
}

/**
 * A bill the shop owes or has paid. A pending bill has been received but not paid yet - it
 * names no account and moves no money until it is marked paid.
 */
export interface Expense {
  id: string;
  /** ISO date, YYYY-MM-DD: the date on the bill. */
  date: string;
  /** Who is owed / was paid. */
  payee?: string;
  /** The bill or receipt number, if there is one. */
  reference?: string;
  note?: string;
  status: "pending" | "paid";
  /** Pending bills: when it falls due, if the bill says. */
  dueDate?: string;
  /** Paid bills: the day it was paid. */
  paidDate?: string;
  /** The account the money was paid from; absent while pending. */
  accountId?: string;
  lines: ExpenseLine[];
  total: number;
}

export interface ExpenseLineInput {
  description: string;
  categoryId: string;
  amount: number;
}

export interface ExpenseInput {
  date: string;
  payee: string;
  reference: string;
  note: string;
  status: "pending" | "paid";
  /** Pending only; "" for none. */
  dueDate: string;
  /** Paid only. */
  accountId: string;
  paidDate: string;
  lines: ExpenseLineInput[];
}

interface ExpenseResponse {
  id: string;
  date: string;
  payee: string | null;
  reference: string | null;
  note: string | null;
  status: "pending" | "paid";
  dueDate: string | null;
  paidDate: string | null;
  accountId: string | null;
  total: string;
  lines: { description: string; categoryId: string; category: string; amount: string }[];
}

function toExpense(response: ExpenseResponse): Expense {
  return {
    id: response.id,
    date: response.date,
    payee: response.payee ?? undefined,
    reference: response.reference ?? undefined,
    note: response.note ?? undefined,
    status: response.status,
    dueDate: response.dueDate ?? undefined,
    paidDate: response.paidDate ?? undefined,
    accountId: response.accountId ?? undefined,
    total: Number(response.total),
    lines: response.lines.map((line) => ({
      description: line.description,
      category: line.category,
      categoryId: line.categoryId,
      amount: Number(line.amount),
    })),
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** Every bill, newest first - requires at least "expenses:view". */
export async function listExpenses(): Promise<Expense[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/expenses?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  return ((await response.json()) as ExpenseResponse[]).map(toExpense);
}

/** The fields of a bill as the audit log shows them. */
function snapshot(expense: Expense) {
  return {
    Date: formatDate(expense.date),
    "Paid to": expense.payee ?? null,
    "Bill number": expense.reference ?? null,
    Items: expense.lines
      .map((line) => `${line.description || line.category} ${formatPrice(line.amount)}`)
      .join(", "),
    Category: categoriesOf(expense).join(", "),
    Total: formatPrice(expense.total),
    Status: expense.status === "paid" ? "Paid" : "To pay",
    Due: expense.dueDate ? formatDate(expense.dueDate) : null,
    "Paid on": expense.paidDate ? formatDate(expense.paidDate) : null,
    "Paid from": expense.accountId ? accountLabel(expense.accountId) : null,
    Note: expense.note ?? null,
  };
}

const labelOf = (expense: Expense) =>
  `${expense.payee ?? expense.lines[0]?.category ?? "Expense"} · ${formatPrice(expense.total)}`;

/** Adds a bill - requires "expenses:edit". Returns the bill, or an error message. */
export async function addExpense(input: ExpenseInput): Promise<Expense | string> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, ...input }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const expense = toExpense((await response.json()) as ExpenseResponse);
  logAudit({
    action: "created",
    module: "Expenses",
    entity: "Expense",
    label: labelOf(expense),
    before: null,
    after: snapshot(expense),
  });
  return expense;
}

/** Saves changes to a bill - requires "expenses:edit". Returns an error message, or null. */
export async function editExpense(previous: Expense, input: ExpenseInput): Promise<string | null> {
  const response = await fetch(`${API_URL}/expenses/${previous.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const expense = toExpense((await response.json()) as ExpenseResponse);
  logAudit({
    action: "updated",
    module: "Expenses",
    entity: "Expense",
    label: labelOf(expense),
    before: snapshot(previous),
    after: snapshot(expense),
  });
  return null;
}

/** Marks a pending bill paid from an account - requires "expenses:edit". Returns an error message, or null. */
export async function payExpense(
  previous: Expense,
  accountId: string,
  paidDate: string,
): Promise<string | null> {
  const response = await fetch(`${API_URL}/expenses/${previous.id}/pay`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ accountId, paidDate }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const expense = toExpense((await response.json()) as ExpenseResponse);
  logAudit({
    action: "updated",
    module: "Expenses",
    entity: "Expense",
    label: labelOf(expense),
    before: snapshot(previous),
    after: snapshot(expense),
  });
  return null;
}

/** Deletes a bill; a paid one's money goes back into its account - requires "expenses:delete". */
export async function deleteExpense(expense: Expense): Promise<string | null> {
  const response = await fetch(`${API_URL}/expenses/${expense.id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  logAudit({
    action: "deleted",
    module: "Expenses",
    entity: "Expense",
    label: labelOf(expense),
    before: snapshot(expense),
    after: null,
  });
  return null;
}

/** The distinct categories a bill touches, in the order they first appear. */
export function categoriesOf(expense: Expense): string[] {
  return Array.from(new Set(expense.lines.map((line) => line.category)));
}

/** A pending bill whose due date has passed. */
export function isOverdue(expense: Expense, today: string): boolean {
  return expense.status === "pending" && expense.dueDate !== undefined && expense.dueDate < today;
}
