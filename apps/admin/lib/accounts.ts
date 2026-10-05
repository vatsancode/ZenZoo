import { PAYMENT_ACCOUNT_OPTIONS } from "./payment-options";
import { listExpenses } from "./expenses";
import { listPurchases } from "./purchases";
import { listSales } from "./sales";

export interface Account {
  /** Also the code stored on payments, e.g. "hdfc-current". */
  id: string;
  name: string;
  /** What was in the account when it was added to ZenZoo. */
  opening: number;
}

export interface Transfer {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  fromId: string;
  toId: string;
  amount: number;
  note?: string;
}

// Sample data standing in for the `payment_accounts` table in docs/db-design.md, which
// has no read capability on the backend yet. Opening balances are an addition here: the
// table is only a label for where money lands, so the balance has to be worked out from
// what has gone in and out since.
let accounts: Account[] = [
  { id: "cash-drawer", name: "Cash drawer", opening: 25000 },
  { id: "hdfc-current", name: "HDFC Current Account", opening: 150000 },
  { id: "icici-savings", name: "ICICI Savings Account", opening: 80000 },
];

let transfers: Transfer[] = [
  {
    id: "tr-1",
    date: "2026-10-02",
    fromId: "cash-drawer",
    toId: "hdfc-current",
    amount: 12000,
    note: "Cash deposited at the bank",
  },
];

const round = (value: number) => Math.round(value * 100) / 100;

/** The pickers across the app read this list, so it is kept in step with the accounts. */
function syncOptions() {
  PAYMENT_ACCOUNT_OPTIONS.splice(
    0,
    PAYMENT_ACCOUNT_OPTIONS.length,
    ...accounts.map((account) => ({ value: account.id, label: account.name })),
  );
}

export async function listAccounts(): Promise<Account[]> {
  return accounts;
}

export async function listTransfers(): Promise<Transfer[]> {
  return transfers;
}

const slug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Adds an account; returns an error message or null. */
export function addAccount(name: string, opening: number): string | null {
  const clean = name.trim();
  if (clean === "") return "Enter the account's name.";
  if (accounts.some((account) => account.name.toLowerCase() === clean.toLowerCase())) {
    return "An account with this name already exists.";
  }
  let id = slug(clean) || `account-${Date.now()}`;
  if (accounts.some((account) => account.id === id)) id = `${id}-${Date.now()}`;
  accounts = [...accounts, { id, name: clean, opening: round(opening) }];
  syncOptions();
  return null;
}

export function editAccount(id: string, name: string, opening: number): string | null {
  const clean = name.trim();
  if (clean === "") return "Enter the account's name.";
  if (
    accounts.some(
      (account) => account.id !== id && account.name.toLowerCase() === clean.toLowerCase(),
    )
  ) {
    return "An account with this name already exists.";
  }
  accounts = accounts.map((account) =>
    account.id === id ? { ...account, name: clean, opening: round(opening) } : account,
  );
  syncOptions();
  return null;
}

export function removeAccount(id: string): void {
  accounts = accounts.filter((account) => account.id !== id);
  syncOptions();
}

export function addTransfer(input: Omit<Transfer, "id">): Transfer {
  const transfer: Transfer = { ...input, id: `tr-${Date.now()}` };
  transfers = [transfer, ...transfers];
  return transfer;
}

// ------------------------------------------------------------------ balances

export interface Movement {
  date: string;
  accountId: string;
  /** Positive when money came in, negative when it went out. */
  amount: number;
  label: string;
}

/**
 * Every rupee that has moved through an account: sales taken in, refunds to
 * customers out, payments to vendors out, refunds from vendors in, expenses
 * out, and transfers either way. An account's balance is its opening balance plus these.
 */
export async function accountMovements(): Promise<Movement[]> {
  const [sales, purchases, expenses] = await Promise.all([
    listSales(),
    listPurchases(),
    listExpenses(),
  ]);
  const movements: Movement[] = [];

  for (const sale of sales) {
    if (sale.payment.amount > 0 && sale.payment.accountId) {
      movements.push({
        date: sale.date,
        accountId: sale.payment.accountId,
        amount: sale.payment.amount,
        label: `Sale ${sale.number} · ${sale.customerName}`,
      });
    }
    for (const ret of sale.returns ?? []) {
      if (ret.refund.mode === "money" && ret.refund.accountId) {
        movements.push({
          date: ret.date,
          accountId: ret.refund.accountId,
          amount: -ret.refund.amount,
          label: `Refund ${ret.number} · ${sale.customerName}`,
        });
      }
    }
  }

  for (const purchase of purchases) {
    const invoice = purchase.reference ? `invoice ${purchase.reference}` : "purchase";
    for (const payment of purchase.payments ?? []) {
      movements.push({
        date: payment.date,
        accountId: payment.accountId,
        amount: -payment.amount,
        label: `Paid to vendor · ${invoice}`,
      });
    }
    for (const ret of purchase.returns ?? []) {
      if (ret.refund.mode === "refunded" && ret.refund.accountId && ret.refund.date) {
        movements.push({
          date: ret.refund.date,
          accountId: ret.refund.accountId,
          amount: ret.refund.amount,
          label: `Refund from vendor · ${invoice}`,
        });
      }
    }
  }

  for (const expense of expenses) {
    movements.push({
      date: expense.date,
      accountId: expense.accountId,
      amount: -expense.total,
      label: `Expense · ${expense.payee ?? expense.lines[0]?.category ?? "bill"}${expense.lines.length > 1 ? ` · ${expense.lines.length} items` : expense.lines[0] ? ` · ${expense.lines[0].category}` : ""}`,
    });
  }

  const nameOf = (id: string) => accounts.find((account) => account.id === id)?.name ?? id;
  for (const transfer of transfers) {
    movements.push({
      date: transfer.date,
      accountId: transfer.fromId,
      amount: -transfer.amount,
      label: `Transfer to ${nameOf(transfer.toId)}${transfer.note ? ` · ${transfer.note}` : ""}`,
    });
    movements.push({
      date: transfer.date,
      accountId: transfer.toId,
      amount: transfer.amount,
      label: `Transfer from ${nameOf(transfer.fromId)}${transfer.note ? ` · ${transfer.note}` : ""}`,
    });
  }

  return movements.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function balanceOf(account: Account, movements: Movement[]): number {
  return round(
    movements
      .filter((movement) => movement.accountId === account.id)
      .reduce((sum, movement) => sum + movement.amount, account.opening),
  );
}
