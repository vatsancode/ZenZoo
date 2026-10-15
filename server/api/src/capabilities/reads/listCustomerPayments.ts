import type { CapabilityActor } from "@zenzoo/types";
import { defineCapability } from "../capability";
import { runInTenantContext, type TenantTx } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import {
  PAYMENT_SELECT,
  toCustomerPaymentDto,
  type CustomerPaymentDto,
} from "../customers/paymentDto";

export interface ListCustomerPaymentsInput {
  storeId: string;
  /** Just one customer's payments. */
  customerId?: string;
}

/** The payments received from customers at this store, newest first (against the open transaction, so it can be tested). */
export async function listCustomerPaymentsInTx(
  tx: TenantTx,
  actor: CapabilityActor,
  input: ListCustomerPaymentsInput,
): Promise<CustomerPaymentDto[]> {
  const rows = await tx.customer_credit_ledger.findMany({
    where: {
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      entry_type: "CREDIT_PAYMENT",
      ...(input.customerId ? { customer_id: input.customerId } : {}),
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 2000,
    select: PAYMENT_SELECT,
  });

  const methodIds = [
    ...new Set(rows.flatMap((row) => (row.payment_method_id ? [row.payment_method_id] : []))),
  ];
  const accountIds = [
    ...new Set(rows.flatMap((row) => (row.payment_account_id ? [row.payment_account_id] : []))),
  ];
  const [methods, accounts] = await Promise.all([
    tx.payment_methods.findMany({
      where: { tenant_id: actor.tenantId, id: { in: methodIds } },
      select: { id: true, code: true, name: true },
    }),
    tx.payment_accounts.findMany({
      where: { tenant_id: actor.tenantId, id: { in: accountIds } },
      select: { id: true, name: true },
    }),
  ]);
  const methodById = new Map(methods.map((method) => [method.id, method]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return rows.map((row) => toCustomerPaymentDto(row, methodById, accountById));
}

export const listCustomerPayments = defineCapability<
  ListCustomerPaymentsInput,
  CustomerPaymentDto[]
>({
  name: "listCustomerPayments",
  kind: "read",
  requiredPermission: "customers:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => listCustomerPaymentsInTx(tx, actor, input));
  },
});
