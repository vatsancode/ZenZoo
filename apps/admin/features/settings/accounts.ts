import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { ensureStoreId } from "../../lib/storeContext";
import { slugify } from "../../lib/slug";
import { logAudit } from "../../lib/audit";
import { formatPrice } from "../../lib/stock-display";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Account {
  id: string;
  name: string;
  code: string;
  status: "active" | "disabled";
  /** What was in the account when it was added to ZenZoo. */
  openingBalance: number;
  /** The live, running balance - kept correct by the database itself, never recalculated here. */
  balance: number;
}

export interface Transfer {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note: string | null;
}

interface AccountResponse {
  id: string;
  name: string;
  code: string;
  status: "active" | "disabled";
  openingBalance: string;
  balance: string;
}

interface TransferResponse {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
  note: string | null;
}

function toAccount(response: AccountResponse): Account {
  return {
    id: response.id,
    name: response.name,
    code: response.code,
    status: response.status,
    openingBalance: Number(response.openingBalance),
    balance: Number(response.balance),
  };
}

function toTransfer(response: TransferResponse): Transfer {
  return {
    id: response.id,
    date: response.date,
    fromAccountId: response.fromAccountId,
    toAccountId: response.toAccountId,
    amount: Number(response.amount),
    note: response.note,
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

/** Lists this store's accounts from the real API - requires at least "settings:view". */
export async function listAccounts(): Promise<Account[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/accounts?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as AccountResponse[];
  return data.map(toAccount);
}

/** Adds an account - requires "settings:edit". Returns the new account, or an error message. */
export async function addAccount(name: string, openingBalance: number): Promise<Account | string> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, name, code: slugify(name), openingBalance }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const account = toAccount((await response.json()) as AccountResponse);
  logAudit({
    action: "created",
    module: "Accounts",
    entity: "Account",
    label: account.name,
    before: null,
    after: { Name: account.name, "Opening balance": formatPrice(account.openingBalance) },
  });
  return account;
}

/** Renames an account and/or corrects its opening balance - requires "settings:edit". */
export async function editAccount(
  id: string,
  name: string,
  openingBalance: number,
): Promise<Account | string> {
  const response = await fetch(`${API_URL}/accounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, openingBalance }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const account = toAccount((await response.json()) as AccountResponse);
  logAudit({
    action: "updated",
    module: "Accounts",
    entity: "Account",
    label: account.name,
    before: null,
    after: { Name: account.name, "Opening balance": formatPrice(account.openingBalance) },
  });
  return account;
}

/** Turns an account on or off - requires "settings:edit". At least one account has to stay on. */
export async function setAccountDisabled(id: string, disabled: boolean): Promise<string | null> {
  const response = await fetch(`${API_URL}/accounts/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ disabled }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const account = toAccount((await response.json()) as AccountResponse);
  logAudit({
    action: "updated",
    module: "Accounts",
    entity: "Account",
    label: account.name,
    before: { Status: disabled ? "Active" : "Disabled" },
    after: { Status: disabled ? "Disabled" : "Active" },
  });
  return null;
}

/** Lists this store's transfer history - requires at least "settings:view". */
export async function listTransfers(): Promise<Transfer[]> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/account-transfers?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as TransferResponse[];
  return data.map(toTransfer);
}

/** The active accounts, shaped for a Select. */
export function accountOptions(accounts: Account[]): { value: string; label: string }[] {
  return accounts
    .filter((account) => account.status === "active")
    .map((account) => ({ value: account.id, label: account.name }));
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
}

/**
 * Moves money between two of this store's own accounts - requires
 * "settings:edit". The database rejects it outright if the source account
 * doesn't have enough balance (see account_transfers' own trigger); this
 * never pre-checks that itself. Returns the new transfer, or an error message.
 */
export async function addTransfer(input: TransferInput): Promise<Transfer | string> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/account-transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ storeId, ...input }),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  const transfer = toTransfer((await response.json()) as TransferResponse);
  const nameOf = (id: string, accounts: Account[]) =>
    accounts.find((account) => account.id === id)?.name ?? id;
  const accounts = await listAccounts();
  logAudit({
    action: "created",
    module: "Accounts",
    entity: "Transfer",
    label: `${nameOf(transfer.fromAccountId, accounts)} to ${nameOf(transfer.toAccountId, accounts)}`,
    before: null,
    after: {
      From: nameOf(transfer.fromAccountId, accounts),
      To: nameOf(transfer.toAccountId, accounts),
      Amount: formatPrice(transfer.amount),
      Note: transfer.note,
    },
  });
  return transfer;
}

// ------------------------------------------------------------------ activity

export interface Movement {
  date: string;
  accountId: string;
  /** Positive when money came in, negative when it went out. */
  amount: number;
  label: string;
}

/**
 * Every rupee that has moved through an account, as far as this app can
 * currently see. Right now that's transfers only - sales, expenses and
 * purchase payments have no backend wired to an account yet (see their
 * own screens' notes), so they add nothing here until those capabilities
 * exist. balance itself is never computed from this list - it's the
 * database's own running total - this is only for the activity feed.
 */
export function transferMovements(accounts: Account[], transfers: Transfer[]): Movement[] {
  const nameOf = (id: string) => accounts.find((account) => account.id === id)?.name ?? id;
  const movements: Movement[] = [];
  for (const transfer of transfers) {
    movements.push({
      date: transfer.date,
      accountId: transfer.fromAccountId,
      amount: -transfer.amount,
      label: `Transfer to ${nameOf(transfer.toAccountId)}${transfer.note ? ` · ${transfer.note}` : ""}`,
    });
    movements.push({
      date: transfer.date,
      accountId: transfer.toAccountId,
      amount: transfer.amount,
      label: `Transfer from ${nameOf(transfer.fromAccountId)}${transfer.note ? ` · ${transfer.note}` : ""}`,
    });
  }
  return movements.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
