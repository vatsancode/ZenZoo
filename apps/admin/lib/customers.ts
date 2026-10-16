import { redirectToSignInIfUnauthorized } from "./auth";
import { rememberPaymentNames } from "./payment-options";
import { ensureStoreId } from "./storeContext";
import type { TillPaymentOptions } from "./till";
import type { DueCollection } from "../features/sales/sales";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** The server's CustomerDto (server/api/src/capabilities/customers/dto.ts). Tenant-wide - known at every store. */
export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "archived";
  /** When they were first added, YYYY-MM-DD. */
  since: string;
  /**
   * What they owe the shop (above 0) or hold as store credit (below 0), as "250.00" / "-100.00" -
   * the server's running total of their ledger, never worked out here.
   */
  balance: string;
}

/** What they owe the shop, in rupees (0 when they owe nothing or hold credit). */
export const owesOf = (customer: Pick<Customer, "balance">): number =>
  Math.max(Number(customer.balance), 0);

/** The store credit they hold, in rupees. */
export const creditOf = (customer: Pick<Customer, "balance">): number =>
  Math.max(-Number(customer.balance), 0);

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T | string> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return await parseError(response);
  }
  return (await response.json()) as T;
}

async function read<T>(path: string): Promise<T> {
  const result = await send<T>(path, "GET");
  if (typeof result === "string") throw new Error(result);
  return result;
}

/** Requires "customers:view". Archived customers only when asked. */
export function listCustomers(includeArchived = false): Promise<Customer[]> {
  return read<Customer[]>(`/customers${includeArchived ? "?includeArchived=true" : ""}`);
}

/** Requires "customers:view". Resolves to null when the customer doesn't exist. */
export async function getCustomer(id: string): Promise<Customer | null> {
  const result = await send<Customer>(`/customers/${encodeURIComponent(id)}`, "GET");
  return typeof result === "string" ? null : result;
}

/** The full form - requires "customers:edit". Returns the new customer, or an error message. */
export function addCustomer(input: CustomerInput): Promise<Customer | string> {
  return send<Customer>("/customers", "POST", input);
}

/** Requires "customers:edit". Returns the updated customer, or an error message. */
export function editCustomer(id: string, input: CustomerInput): Promise<Customer | string> {
  return send<Customer>(`/customers/${encodeURIComponent(id)}`, "PUT", input);
}

/** Archive or restore - requires "customers:delete". Returns the customer, or an error message. */
export function setCustomerArchived(id: string, archived: boolean): Promise<Customer | string> {
  return send<Customer>(`/customers/${encodeURIComponent(id)}/status`, "PUT", { archived });
}

/** The till's picker: active customers, under "pos:view". */
export function listTillCustomers(): Promise<Customer[]> {
  return read<Customer[]>("/till/customers");
}

/** Adding a customer at the counter - name and phone only, under "pos:edit". */
export function quickAddCustomer(name: string, phone?: string): Promise<Customer | string> {
  return send<Customer>("/till/customers", "POST", { name, phone });
}

/** The active methods and accounts a payment from a customer can come in by - requires "customers:edit". */
export async function listCustomerPaymentOptions(): Promise<TillPaymentOptions> {
  const storeId = await ensureStoreId();
  const options = await read<TillPaymentOptions>(`/customers/payment-options?storeId=${storeId}`);
  rememberPaymentNames(options.methods, options.accounts);
  return options;
}

/** The server's CustomerPaymentDto (server/api/src/capabilities/customers/paymentDto.ts). */
interface CustomerPaymentDto {
  id: string;
  customerId: string;
  receivedAt: string;
  amount: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  paymentAccountId: string;
  paymentAccountName: string;
  note: string | null;
}

function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toCollection(dto: CustomerPaymentDto): DueCollection {
  rememberPaymentNames(
    [{ code: dto.paymentMethodCode, name: dto.paymentMethodName }],
    [{ id: dto.paymentAccountId, name: dto.paymentAccountName }],
  );
  return {
    id: dto.id,
    customerId: dto.customerId,
    date: localDay(dto.receivedAt),
    amount: Number(dto.amount),
    method: dto.paymentMethodCode,
    accountId: dto.paymentAccountId,
    note: dto.note ?? undefined,
  };
}

/** Payments received from customers, newest first - requires "customers:view". */
export async function listCollections(customerId?: string): Promise<DueCollection[]> {
  const storeId = await ensureStoreId();
  const query = new URLSearchParams({ storeId });
  if (customerId) query.set("customerId", customerId);
  return (await read<CustomerPaymentDto[]>(`/customers/payments?${query}`)).map(toCollection);
}

/**
 * A customer pays down what they owe - requires "customers:edit". Never more than they owe.
 * Returns what they still owe afterwards, or an error message.
 */
export async function receivePayment(
  customerId: string,
  input: {
    amount: number;
    paymentMethodId: string;
    paymentAccountId: string;
    note?: string;
    /** Allow more than they owe; the extra is kept as store credit. */
    keepExtraAsCredit?: boolean;
  },
): Promise<{ balance: number; keptAsCredit: number } | string> {
  const storeId = await ensureStoreId();
  const result = await send<{ balance: string; keptAsCredit: string }>(
    `/customers/${encodeURIComponent(customerId)}/payments`,
    "POST",
    { storeId, ...input },
  );
  return typeof result === "string"
    ? result
    : { balance: Number(result.balance), keptAsCredit: Number(result.keptAsCredit) };
}

/** One line of a customer's account - the server's CustomerStatementEntryDto, amounts as numbers. */
export type StatementType =
  | "CREDIT_SALE"
  | "CREDIT_PAYMENT"
  | "CREDIT_ADJUSTMENT"
  | "CREDIT_REVERSAL"
  | "SALE_PAYMENT"
  | "RETURN_REFUND"
  | "PAYMENT_RETURNED";

export interface StatementEntry {
  id: string;
  /** ISO date and time it was entered. */
  at: string;
  type: StatementType;
  /** What it did to the balance: above 0 is a debit (they owe more), below 0 a credit (they owe less, or hold store credit). 0 for cash-only lines. */
  amount: number;
  /** Cash that moved: above 0 received from the customer, below 0 paid back to them; null when no cash moved. */
  money: number | null;
  /** What they owed (above 0) or held as store credit (below 0) right after this entry. */
  balance: number;
  saleId: string | null;
  saleNumber: string | null;
  returnNumber: string | null;
  /** STORE_CREDIT or ON_ACCOUNT for a sale entry; how it was paid for a payment received. */
  methodCode: string | null;
  methodName: string | null;
  accountName: string | null;
  reference: string | null;
  note: string | null;
  enteredBy: string;
}

interface StatementDto {
  id: string;
  createdAt: string;
  type: StatementType;
  amount: string;
  money: string | null;
  balance: string;
  saleId: string | null;
  saleNumber: string | null;
  returnNumber: string | null;
  methodCode: string | null;
  methodName: string | null;
  accountName: string | null;
  reference: string | null;
  note: string | null;
  enteredBy: string;
}

/**
 * Everything on a customer's account, oldest first, with the running balance after each entry -
 * requires "customers:view". The ledger behind it is append-only: nothing here can be changed.
 */
export async function listCustomerStatement(customerId: string): Promise<StatementEntry[]> {
  const rows = await read<StatementDto[]>(`/customers/${encodeURIComponent(customerId)}/statement`);
  return rows.map((row) => ({
    id: row.id,
    at: row.createdAt,
    type: row.type,
    amount: Number(row.amount),
    money: row.money === null ? null : Number(row.money),
    balance: Number(row.balance),
    saleId: row.saleId,
    saleNumber: row.saleNumber,
    returnNumber: row.returnNumber,
    methodCode: row.methodCode,
    methodName: row.methodName,
    accountName: row.accountName,
    reference: row.reference,
    note: row.note,
    enteredBy: row.enteredBy,
  }));
}
