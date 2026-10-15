import { redirectToSignInIfUnauthorized } from "./auth";
import { rememberPaymentNames } from "./payment-options";
import { ensureStoreId } from "./storeContext";
import type { Sale } from "../features/sales/sales";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** The server's SaleDto (server/api/src/capabilities/sales/dto.ts). Amounts are two-decimal strings. */
interface SaleDto {
  id: string;
  number: string | null;
  customerId: string | null;
  customerName: string | null;
  soldAt: string;
  subtotal: string;
  discount: string;
  billDiscount: string;
  total: string;
  lines: {
    variantId: string;
    productId: string;
    productName: string;
    variantName: string;
    categoryName: string;
    sku: string | null;
    unit: string;
    service: boolean;
    quantity: number;
    unitPrice: string;
    discount: string;
    billShare: string;
    cost: string;
  }[];
  payments: {
    paymentMethodCode: string;
    paymentMethodName: string;
    paymentAccountId: string | null;
    paymentAccountName: string | null;
    amount: string;
  }[];
}

/** The two payment methods that put money on the customer's account instead of into an account. */
const STORE_CREDIT = "STORE_CREDIT";
const ON_ACCOUNT = "ON_ACCOUNT";

const round = (value: number) => Math.round(value * 100) / 100;

/** The shop's own calendar day for a moment in time, as YYYY-MM-DD. */
function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The server's sale, in the shape the screens already use (rupees as numbers). Two details:
 * a line's `discount` is its OWN discount only - the bill discount is spread across the lines on
 * the server, but the screens (and the refund maths) take it from the sale's `billDiscount`; and
 * `sku` is the variant's id, a key that is always unique, with the SKU people see in `code`.
 */
export function toSale(dto: SaleDto): Sale {
  rememberPaymentNames(
    dto.payments.map((payment) => ({
      code: payment.paymentMethodCode,
      name: payment.paymentMethodName,
    })),
    dto.payments.flatMap((payment) =>
      payment.paymentAccountId
        ? [
            {
              id: payment.paymentAccountId,
              name: payment.paymentAccountName ?? payment.paymentAccountId,
            },
          ]
        : [],
    ),
  );

  const billDiscount = Number(dto.billDiscount);
  // Money received goes in `payments`; what was put on the customer's account does not - the
  // screens show it as store credit spent and as left on account.
  const sum = (code: string) =>
    round(
      dto.payments
        .filter((payment) => payment.paymentMethodCode === code)
        .reduce((total, payment) => total + Number(payment.amount), 0),
    );
  const creditUsed = sum(STORE_CREDIT);
  const dueAmount = sum(ON_ACCOUNT);
  return {
    id: dto.id,
    number: dto.number ?? "",
    date: localDay(dto.soldAt),
    customerId: dto.customerId ?? undefined,
    customerName: dto.customerName ?? "Walk-in customer",
    lines: dto.lines.map((line) => ({
      sku: line.variantId,
      code: line.sku,
      productId: line.productId,
      name:
        line.variantName === line.productName
          ? line.productName
          : `${line.productName} - ${line.variantName}`,
      category: line.categoryName,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      discount: round(Number(line.discount) - Number(line.billShare)),
      unitCost: Number(line.cost) / line.quantity,
      service: line.service,
    })),
    subtotal: Number(dto.subtotal),
    lineDiscounts: round(Number(dto.discount) - billDiscount),
    billDiscount,
    total: Number(dto.total),
    payments: dto.payments
      .filter(
        (payment) =>
          payment.paymentMethodCode !== STORE_CREDIT && payment.paymentMethodCode !== ON_ACCOUNT,
      )
      .map((payment) => ({
        method: payment.paymentMethodCode,
        accountId: payment.paymentAccountId ?? "",
        amount: Number(payment.amount),
      })),
    creditUsed: creditUsed > 0 ? creditUsed : undefined,
    dueAmount: dueAmount > 0 ? dueAmount : undefined,
    returns: [],
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

export interface ListSalesOptions {
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  customerId?: string;
}

/** The store's completed sales, newest first - requires "sales:view". Capped at the latest 1000. */
export async function listSales(options: ListSalesOptions = {}): Promise<Sale[]> {
  const storeId = await ensureStoreId();
  const query = new URLSearchParams({ storeId });
  for (const [key, value] of Object.entries(options)) if (value) query.set(key, value);
  const response = await fetch(`${API_URL}/sales?${query}`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  return ((await response.json()) as SaleDto[]).map(toSale);
}

/** One sale - requires "sales:view". Resolves to null when there is no such sale. */
export async function getSale(id: string): Promise<Sale | null> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/sales/${encodeURIComponent(id)}?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return null;
  }
  return toSale((await response.json()) as SaleDto);
}

export interface CreateSaleInput {
  /** Made by the till. Reuse it to retry the SAME sale; make a new one when anything about it changes. */
  id: string;
  customerId?: string;
  lines: {
    variantId: string;
    quantity: number;
    /** Exactly as typed: rupees for "amount", a percentage for "percent". */
    discount?: { type: "amount" | "percent"; value: number };
    /** Rupees - only for a custom-priced item. */
    customPrice?: number;
  }[];
  billDiscount?: { type: "amount" | "percent"; value: number };
  /** The total the cashier saw; the server refuses the sale if its own total differs. */
  expectedTotal: number;
  payments: { paymentMethodId: string; paymentAccountId: string; amount: number }[];
  /** Rupees paid with the customer's store credit. Needs a customer. */
  storeCreditAmount?: number;
  /** Rupees left to pay later, added to what the customer owes. Needs a customer. */
  onAccountAmount?: number;
}

export type CreateSaleResult =
  | { ok: true; sale: Sale }
  | {
      ok: false;
      error: string;
      /** The prices or stock moved since the cashier looked - review the bill and try again. */
      conflict: boolean;
      /** The request never got an answer, so the sale may or may not have been saved. Retrying with the same id is safe. */
      unknown: boolean;
    };

/** Saves a real sale - requires "pos:edit". Sending the same id twice never charges twice. */
export async function createSale(input: CreateSaleInput): Promise<CreateSaleResult> {
  const storeId = await ensureStoreId();
  let response: Response;
  try {
    response = await fetch(`${API_URL}/sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ storeId, ...input }),
    });
  } catch {
    return {
      ok: false,
      error:
        "Couldn't reach the server. Check the connection and try again - the sale won't be charged twice.",
      conflict: false,
      unknown: true,
    };
  }
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return {
      ok: false,
      error: await parseError(response),
      conflict: response.status === 409,
      unknown: false,
    };
  }
  return { ok: true, sale: toSale((await response.json()) as SaleDto) };
}
