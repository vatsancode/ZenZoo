import { PAYMENT_ACCOUNT_LABELS, PAYMENT_ACCOUNT_OPTIONS } from "../../lib/payment-options";
import { logAudit } from "../../lib/audit";
import { listExpenses } from "../expenses/expenses";
import { listPurchases } from "../purchases/purchases";
import { listCollections, listCustomers, listSales } from "../sales/sales";
import { formatPrice } from "../../lib/stock-display";

export interface Account {
  /** Also the code stored on payments, e.g. "hdfc-current". */
  id: string;
  name: string;
  /** What was in the account when it was added to ZenZoo. */
  opening: number;
  /** Turned off: it stays in history and keeps its balance, but isn't offered for new payments. */
  disabled?: boolean;
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
    ...accounts
      .filter((account) => !account.disabled)
      .map((account) => ({ value: account.id, label: account.name })),
  );
  // Names stay known for every account, so history that mentions a disabled one still reads properly.
  PAYMENT_ACCOUNT_LABELS.splice(
    0,
    PAYMENT_ACCOUNT_LABELS.length,
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
  logAudit({
    action: "created",
    module: "Accounts",
    entity: "Account",
    label: clean,
    before: null,
    after: { Name: clean, "Opening balance": formatPrice(round(opening)) },
  });
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
  const previous = accounts.find((account) => account.id === id);
  accounts = accounts.map((account) =>
    account.id === id ? { ...account, name: clean, opening: round(opening) } : account,
  );
  syncOptions();
  if (previous) {
    logAudit({
      action: "updated",
      module: "Accounts",
      entity: "Account",
      label: clean,
      before: { Name: previous.name, "Opening balance": formatPrice(previous.opening) },
      after: { Name: clean, "Opening balance": formatPrice(round(opening)) },
    });
  }
  return null;
}

/** Turns an account off or back on. At least one account has to stay on. */
export function setAccountDisabled(id: string, disabled: boolean): string | null {
  if (
    disabled &&
    accounts.filter((account) => !account.disabled && account.id !== id).length === 0
  ) {
    return "At least one account has to stay on.";
  }
  const previous = accounts.find((account) => account.id === id);
  accounts = accounts.map((account) => (account.id === id ? { ...account, disabled } : account));
  syncOptions();
  if (previous) {
    logAudit({
      action: "updated",
      module: "Accounts",
      entity: "Account",
      label: previous.name,
      before: { Status: previous.disabled ? "Disabled" : "Active" },
      after: { Status: disabled ? "Disabled" : "Active" },
    });
  }
  return null;
}

export function removeAccount(id: string): void {
  accounts = accounts.filter((account) => account.id !== id);
  syncOptions();
}

export function addTransfer(input: Omit<Transfer, "id">): Transfer {
  const transfer: Transfer = { ...input, id: `tr-${Date.now()}` };
  transfers = [transfer, ...transfers];
  const nameOf = (id: string) => accounts.find((account) => account.id === id)?.name ?? id;
  logAudit({
    action: "created",
    module: "Accounts",
    entity: "Transfer",
    label: `${nameOf(transfer.fromId)} to ${nameOf(transfer.toId)}`,
    before: null,
    after: {
      From: nameOf(transfer.fromId),
      To: nameOf(transfer.toId),
      Amount: formatPrice(transfer.amount),
      Note: transfer.note ?? null,
    },
  });
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
  const [sales, purchases, expenses, collections, customers] = await Promise.all([
    listSales(),
    listPurchases(),
    listExpenses(),
    listCollections(),
    listCustomers(),
  ]);
  const movements: Movement[] = [];

  for (const sale of sales) {
    for (const payment of sale.payments) {
      if (payment.amount > 0 && payment.accountId) {
        movements.push({
          date: sale.date,
          accountId: payment.accountId,
          amount: payment.amount,
          label: `Sale ${sale.number} · ${sale.customerName}`,
        });
      }
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

  // Purchases no longer carry payments/returns at all (purchases.ts was
  // rewired to the real API, which has no backend for either yet) - so
  // there's nothing to add here until that capability exists. Previously
  // this looped purchase.payments/.returns, both now gone.
  void purchases;

  for (const expense of expenses) {
    movements.push({
      date: expense.date,
      accountId: expense.accountId,
      amount: -expense.total,
      label: `Expense · ${expense.payee ?? expense.lines[0]?.category ?? "bill"}${expense.lines.length > 1 ? ` · ${expense.lines.length} items` : expense.lines[0] ? ` · ${expense.lines[0].category}` : ""}`,
    });
  }

  for (const collection of collections) {
    movements.push({
      date: collection.date,
      accountId: collection.accountId,
      amount: collection.amount,
      label: `Dues collected · ${customers.find((customer) => customer.id === collection.customerId)?.name ?? "customer"}`,
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
