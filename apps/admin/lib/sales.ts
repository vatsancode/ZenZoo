import { redirectToSignInIfUnauthorized } from "./auth";
import { rememberPaymentNames } from "./payment-options";
import { ensureStoreId } from "./storeContext";
import type { TillPaymentOptions } from "./till";
import type { Sale, SaleReturn } from "../features/sales/sales";

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
  status: "draft" | "completed" | "voided";
  voidReason: string | null;
  lines: {
    id: string;
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
    lineTotal: string;
    returned: number;
  }[];
  returns: {
    id: string;
    number: string | null;
    createdAt: string;
    reason: string | null;
    note: string | null;
    refundMode: "money" | "credit" | "none";
    value: string;
    refundAmount: string;
    refundMethodCode: string | null;
    refundAccountId: string | null;
    refundAccountName: string | null;
    items: { saleItemId: string; quantity: number; value: string }[];
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
  const lineBySaleItem = new Map(dto.lines.map((line) => [line.id, line]));
  const nameOf = (line: SaleDto["lines"][number]) =>
    line.variantName === line.productName
      ? line.productName
      : `${line.productName} - ${line.variantName}`;
  const returns: SaleReturn[] = dto.returns.map((ret) => {
    if (ret.refundMethodCode || ret.refundAccountName) {
      rememberPaymentNames(
        ret.refundMethodCode ? [{ code: ret.refundMethodCode, name: ret.refundMethodCode }] : [],
        ret.refundAccountId && ret.refundAccountName
          ? [{ id: ret.refundAccountId, name: ret.refundAccountName }]
          : [],
      );
    }
    return {
      id: ret.id,
      number: ret.number ?? "",
      date: localDay(ret.createdAt),
      reason: ret.reason ?? "",
      note: ret.note ?? undefined,
      items: ret.items.flatMap((item) => {
        const line = lineBySaleItem.get(item.saleItemId);
        return line
          ? [
              {
                sku: line.variantId,
                name: nameOf(line),
                unit: line.unit,
                quantity: item.quantity,
                unitRefund: round(Number(item.value) / item.quantity),
              },
            ]
          : [];
      }),
      value: Number(ret.value),
      refund: {
        mode: ret.refundMode,
        amount: Number(ret.refundAmount),
        method: ret.refundMethodCode ?? undefined,
        accountId: ret.refundAccountId ?? undefined,
      },
    };
  });
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
      id: line.id,
      lineTotal: Number(line.lineTotal),
      returned: line.returned > 0 ? line.returned : undefined,
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
    returns,
    voided: dto.status === "voided" ? true : undefined,
    voidReason: dto.voidReason ?? undefined,
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
  /** Cancelled sales too - only the Sales list wants them; totals everywhere else leave them out. */
  includeVoided?: boolean;
}

/** The store's completed sales, newest first - requires "sales:view". Capped at the latest 1000. */
export async function listSales(options: ListSalesOptions = {}): Promise<Sale[]> {
  const storeId = await ensureStoreId();
  const query = new URLSearchParams({ storeId });
  for (const [key, value] of Object.entries(options)) if (value) query.set(key, String(value));
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

/** The active methods and accounts a refund can be paid back by - requires "sales:edit". */
export async function listSaleRefundOptions(): Promise<TillPaymentOptions> {
  const storeId = await ensureStoreId();
  const response = await fetch(`${API_URL}/sales/payment-options?storeId=${storeId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    throw new Error(await parseError(response));
  }
  const options = (await response.json()) as TillPaymentOptions;
  rememberPaymentNames(options.methods, options.accounts);
  return options;
}

export interface ReturnInput {
  /** Made when the return sheet opens. Reuse it to retry the SAME return; the server never takes goods back twice for one id. */
  id: string;
  reason: string;
  note?: string;
  items: { saleItemId: string; quantity: number }[];
  refund: {
    mode: "money" | "credit" | "none";
    /** Rupees - leave out for the full value of the goods. */
    amount?: number;
    paymentMethodId?: string;
    paymentAccountId?: string;
  };
}

/** What a sale change (return or cancel) came to: the sale as it is now, or why it didn't happen. */
export type SaleChangeResult = { ok: true; sale: Sale } | { ok: false; error: string };

async function changeSale(path: string, body: unknown): Promise<SaleChangeResult> {
  const storeId = await ensureStoreId();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ storeId, ...(body as object) }),
    });
  } catch {
    return {
      ok: false,
      error:
        "Couldn't reach the server. Check the connection and try again - it won't be done twice.",
    };
  }
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return { ok: false, error: await parseError(response) };
  }
  return { ok: true, sale: toSale((await response.json()) as SaleDto) };
}

/** Takes goods back and makes the customer whole - requires "sales:edit". */
export function createSaleReturn(saleId: string, input: ReturnInput): Promise<SaleChangeResult> {
  return changeSale(`/sales/${encodeURIComponent(saleId)}/returns`, input);
}

/** Cancels a completed sale - requires "sales:delete". */
export function voidSale(saleId: string, reason: string): Promise<SaleChangeResult> {
  return changeSale(`/sales/${encodeURIComponent(saleId)}/void`, { reason });
}
