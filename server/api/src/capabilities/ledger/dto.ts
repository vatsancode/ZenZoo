import type { TenantTx } from "../../shared/tenantContext";

/** What moved the money - the same list as account_ledger_kind_check. */
export const LEDGER_KINDS = [
  "starting_balance",
  "opening_balance",
  "opening_correction",
  "sale_payment",
  "sale_void",
  "sale_refund",
  "customer_payment",
  "purchase_payment",
  "expense_payment",
  "expense_reversal",
  "transfer_in",
  "transfer_out",
  "other",
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export function isLedgerKind(value: unknown): value is LedgerKind {
  return typeof value === "string" && (LEDGER_KINDS as readonly string[]).includes(value);
}

/** Where a row came from, for a screen that wants to link to it. */
export interface LedgerLink {
  type: "sale" | "purchase" | "customer";
  id: string;
}

export interface LedgerRowDto {
  id: string;
  /** When it was recorded (ISO date-time). */
  at: string;
  accountId: string;
  accountName: string;
  kind: LedgerKind;
  /** Money in is positive, money out negative. */
  amount: string;
  balanceAfter: string;
  /** A short plain sentence, e.g. "Sale S-0042 · Priya" or "Transfer to HDFC Current". */
  description: string;
  /** Who did it, when the row was written by a signed-in person. */
  by: string | null;
  link: LedgerLink | null;
}

export interface LedgerPageDto {
  rows: LedgerRowDto[];
  /** Rows matching the filters, across every page. */
  total: number;
  /** Sums across every page of the filtered rows. */
  moneyIn: string;
  moneyOut: string;
}

export interface LedgerRow {
  id: string;
  account_id: string;
  kind: string;
  source_id: string | null;
  amount: { toString(): string };
  balance_after: { toString(): string };
  created_by: string | null;
  created_at: Date;
}

export const LEDGER_SELECT = {
  id: true,
  account_id: true,
  kind: true,
  source_id: true,
  amount: true,
  balance_after: true,
  created_by: true,
  created_at: true,
} as const;

const idsOf = (rows: LedgerRow[], kinds: LedgerKind[]) => [
  ...new Set(
    rows
      .filter((row) => (kinds as string[]).includes(row.kind) && row.source_id)
      .map((row) => row.source_id as string),
  ),
];

const byId = <T extends { id: string }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]));

const personName = (first: string, last: string | null) => (last ? `${first} ${last}` : first);

/**
 * Turns ledger rows into what a person reads: a sentence naming the sale, purchase, customer or
 * account behind each movement. Looked up in batches, one query per kind of source, so a page
 * of rows costs a handful of queries whatever its size. A source that no longer exists (a
 * deleted expense) still gets a sentence - the ledger row itself never goes away.
 */
export async function describeLedgerRows(
  tx: TenantTx,
  tenantId: string,
  rows: LedgerRow[],
  accountNames: Map<string, string>,
): Promise<LedgerRowDto[]> {
  const salePaymentIds = idsOf(rows, ["sale_payment"]);
  const returnIds = idsOf(rows, ["sale_refund"]);
  const creditIds = idsOf(rows, ["customer_payment"]);
  const purchasePaymentIds = idsOf(rows, ["purchase_payment"]);
  const expenseIds = idsOf(rows, ["expense_payment", "expense_reversal"]);
  const transferIds = idsOf(rows, ["transfer_in", "transfer_out"]);
  const userIds = [
    ...new Set(rows.map((row) => row.created_by).filter((id): id is string => !!id)),
  ];

  const [salePayments, returns, credits, purchasePayments, expenses, transfers, users] =
    await Promise.all([
      salePaymentIds.length
        ? tx.sale_payments.findMany({
            where: { tenant_id: tenantId, id: { in: salePaymentIds } },
            select: { id: true, sale_id: true },
          })
        : [],
      returnIds.length
        ? tx.sale_returns.findMany({
            where: { tenant_id: tenantId, id: { in: returnIds } },
            select: { id: true, sale_id: true, return_number: true },
          })
        : [],
      creditIds.length
        ? tx.customer_credit_ledger.findMany({
            where: { tenant_id: tenantId, id: { in: creditIds } },
            select: { id: true, customer_id: true },
          })
        : [],
      purchasePaymentIds.length
        ? tx.purchase_payments.findMany({
            where: { tenant_id: tenantId, id: { in: purchasePaymentIds } },
            select: { id: true, purchase_id: true },
          })
        : [],
      expenseIds.length
        ? tx.expenses.findMany({
            where: { tenant_id: tenantId, id: { in: expenseIds } },
            select: { id: true, payee: true },
          })
        : [],
      transferIds.length
        ? tx.account_transfers.findMany({
            where: { tenant_id: tenantId, id: { in: transferIds } },
            select: { id: true, from_account_id: true, to_account_id: true, note: true },
          })
        : [],
      userIds.length
        ? tx.users.findMany({
            where: { id: { in: userIds } },
            select: { id: true, first_name: true, last_name: true },
          })
        : [],
    ]);

  // Second round: the sales and purchases those rows point at, then their customers and vendors.
  const saleIds = [
    ...new Set([
      ...idsOf(rows, ["sale_void"]),
      ...salePayments.map((row) => row.sale_id),
      ...returns.map((row) => row.sale_id),
    ]),
  ];
  const purchaseIds = [...new Set(purchasePayments.map((row) => row.purchase_id))];
  const [sales, purchases] = await Promise.all([
    saleIds.length
      ? tx.sales.findMany({
          where: { tenant_id: tenantId, id: { in: saleIds } },
          select: { id: true, sale_number: true, customer_id: true },
        })
      : [],
    purchaseIds.length
      ? tx.purchases.findMany({
          where: { tenant_id: tenantId, id: { in: purchaseIds } },
          select: { id: true, reference_number: true, supplier_id: true },
        })
      : [],
  ]);

  const customerIds = [
    ...new Set([
      ...credits.map((row) => row.customer_id),
      ...sales.map((row) => row.customer_id).filter((id): id is string => !!id),
    ]),
  ];
  const supplierIds = [...new Set(purchases.map((row) => row.supplier_id))];
  const [customers, suppliers] = await Promise.all([
    customerIds.length
      ? tx.customers.findMany({
          where: { tenant_id: tenantId, id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : [],
    supplierIds.length
      ? tx.suppliers.findMany({
          where: { tenant_id: tenantId, id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const salePaymentMap = byId(salePayments);
  const returnMap = byId(returns);
  const creditMap = byId(credits);
  const purchasePaymentMap = byId(purchasePayments);
  const expenseMap = byId(expenses);
  const transferMap = byId(transfers);
  const userMap = byId(users);
  const saleMap = byId(sales);
  const purchaseMap = byId(purchases);
  const customerMap = byId(customers);
  const supplierMap = byId(suppliers);

  const account = (id: string) => accountNames.get(id) ?? "another account";
  const saleLabel = (saleId: string | undefined) => {
    const sale = saleId ? saleMap.get(saleId) : undefined;
    const customer = sale?.customer_id ? customerMap.get(sale.customer_id)?.name : undefined;
    const number = sale?.sale_number ? `Sale ${sale.sale_number}` : "A sale";
    return customer ? `${number} · ${customer}` : number;
  };

  return rows.map((row) => {
    const kind = (isLedgerKind(row.kind) ? row.kind : "other") as LedgerKind;
    const source = row.source_id ?? "";
    let description: string;
    let link: LedgerLink | null = null;

    switch (kind) {
      case "starting_balance":
        description = "Balance when this ledger started";
        break;
      case "opening_balance":
        description = "Opening balance";
        break;
      case "opening_correction":
        description = "Opening balance corrected";
        break;
      case "sale_payment": {
        const saleId = salePaymentMap.get(source)?.sale_id;
        description = saleLabel(saleId);
        link = saleId ? { type: "sale", id: saleId } : null;
        break;
      }
      case "sale_void":
        description = `${saleLabel(source)} - cancelled`;
        link = saleMap.has(source) ? { type: "sale", id: source } : null;
        break;
      case "sale_refund": {
        const ret = returnMap.get(source);
        const returnNumber = ret?.return_number ? ` (return ${ret.return_number})` : "";
        description = `Refund for ${saleLabel(ret?.sale_id).replace(/^A sale/, "a sale")}${returnNumber}`;
        link = ret ? { type: "sale", id: ret.sale_id } : null;
        break;
      }
      case "customer_payment": {
        const customerId = creditMap.get(source)?.customer_id;
        const name = customerId ? customerMap.get(customerId)?.name : undefined;
        description = name ? `Payment from ${name}` : "Payment from a customer";
        link = customerId ? { type: "customer", id: customerId } : null;
        break;
      }
      case "purchase_payment": {
        const purchaseId = purchasePaymentMap.get(source)?.purchase_id;
        const purchase = purchaseId ? purchaseMap.get(purchaseId) : undefined;
        const vendor = purchase ? supplierMap.get(purchase.supplier_id)?.name : undefined;
        const reference = purchase?.reference_number ? ` ${purchase.reference_number}` : "";
        description = `Paid for purchase${reference}${vendor ? ` · ${vendor}` : ""}`;
        link = purchaseId ? { type: "purchase", id: purchaseId } : null;
        break;
      }
      case "expense_payment":
      case "expense_reversal": {
        const expense = expenseMap.get(source);
        const payee = expense?.payee ? ` · ${expense.payee}` : "";
        if (kind === "expense_payment") description = `Expense paid${payee}`;
        else if (!expense) description = "Expense deleted - money put back";
        else description = `Expense changed - earlier amount put back${payee}`;
        break;
      }
      case "transfer_in":
      case "transfer_out": {
        const transfer = transferMap.get(source);
        const note = transfer?.note ? ` · ${transfer.note}` : "";
        description =
          kind === "transfer_in"
            ? `Transfer from ${transfer ? account(transfer.from_account_id) : "another account"}${note}`
            : `Transfer to ${transfer ? account(transfer.to_account_id) : "another account"}${note}`;
        break;
      }
      default:
        description = "Balance change";
    }

    const user = row.created_by ? userMap.get(row.created_by) : undefined;
    return {
      id: row.id,
      at: row.created_at.toISOString(),
      accountId: row.account_id,
      accountName: account(row.account_id),
      kind,
      amount: row.amount.toString(),
      balanceAfter: row.balance_after.toString(),
      description,
      by: user ? personName(user.first_name, user.last_name) : null,
      link,
    };
  });
}
