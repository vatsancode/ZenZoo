import type { CapabilityActor } from "@zenzoo/types";
import { defineCapability } from "../capability";
import { runInTenantContext, type TenantTx } from "../../shared/tenantContext";
import {
  buildStatement,
  LEDGER_SELECT,
  PAYMENT_STATEMENT_SELECT,
  REFUND_STATEMENT_SELECT,
  type CustomerStatementEntryDto,
} from "../customers/statementDto";

export interface ListCustomerStatementInput {
  customerId: string;
}

const LIMIT = 5000;

/** The statement's work, against an open transaction (so it can be tested without committing). */
export async function listCustomerStatementInTx(
  tx: TenantTx,
  actor: CapabilityActor,
  input: ListCustomerStatementInput,
): Promise<CustomerStatementEntryDto[]> {
  if (!input.customerId) throw new Error("Choose a customer.");
  const customer = await tx.customers.findFirst({
    where: { id: input.customerId, tenant_id: actor.tenantId },
    select: { id: true },
  });
  if (!customer) throw new Error("That customer doesn't exist.");

  // A customer is known at every store and their balance is across every store, so the statement is too.
  const [ledger, payments, refunds] = await Promise.all([
    tx.customer_credit_ledger.findMany({
      where: { tenant_id: actor.tenantId, customer_id: customer.id },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: LIMIT,
      select: LEDGER_SELECT,
    }),
    // Money taken at the till into a real account. A payment put on the customer's account names
    // no account and is already a ledger entry, so it isn't counted twice.
    tx.sale_payments.findMany({
      where: {
        tenant_id: actor.tenantId,
        payment_account_id: { not: null },
        sales: { customer_id: customer.id, status: { in: ["completed", "voided"] } },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: LIMIT,
      select: PAYMENT_STATEMENT_SELECT,
    }),
    // Returns refunded in money (a credit refund is a ledger entry; "no refund" moved nothing).
    tx.sale_returns.findMany({
      where: {
        tenant_id: actor.tenantId,
        status: "completed",
        refund_mode: "money",
        sales: { customer_id: customer.id },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: LIMIT,
      select: REFUND_STATEMENT_SELECT,
    }),
  ]);

  const ids = (pick: (row: (typeof ledger)[number]) => string | null) => [
    ...new Set(ledger.flatMap((row) => pick(row) ?? [])),
  ];
  const [returns, methods, accounts] = await Promise.all([
    tx.sale_returns.findMany({
      where: { tenant_id: actor.tenantId, id: { in: ids((row) => row.sale_return_id) } },
      select: { id: true, return_number: true },
    }),
    tx.payment_methods.findMany({
      where: { tenant_id: actor.tenantId, id: { in: ids((row) => row.payment_method_id) } },
      select: { id: true, code: true, name: true },
    }),
    tx.payment_accounts.findMany({
      where: { tenant_id: actor.tenantId, id: { in: ids((row) => row.payment_account_id) } },
      select: { id: true, name: true },
    }),
  ]);

  return buildStatement(ledger, payments, refunds, {
    returnNumbers: new Map(returns.map((ret) => [ret.id, ret.return_number])),
    methods: new Map(methods.map((method) => [method.id, method])),
    accounts: new Map(accounts.map((account) => [account.id, account])),
  });
}

/**
 * Every transaction between a customer and the shop, oldest first, each with the balance right
 * after it: payments taken at the till, sales put on the account, payments received later, refunds
 * paid back, store credit from returns, and reversals. Entries that move the customer's balance come
 * from the append-only ledger, which the database refuses to edit or delete - so it is a permanent
 * record. Cash entries never change the balance.
 */
export const listCustomerStatement = defineCapability<
  ListCustomerStatementInput,
  CustomerStatementEntryDto[]
>({
  name: "listCustomerStatement",
  kind: "read",
  requiredPermission: "customers:view",
  async handler(actor, input) {
    return runInTenantContext(actor, (tx) => listCustomerStatementInTx(tx, actor, input));
  },
});
