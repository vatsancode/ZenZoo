import type { CapabilityActor } from "@zenzoo/types";
import { defineCapability } from "../capability";
import { runInTenantContext, type TenantTx } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";

export interface ListTillPaymentOptionsInput {
  storeId: string;
}

export interface TillPaymentOptionsDto {
  /** Ways to take money now. Customer credit ("on account") is left out - it isn't money received. */
  methods: { id: string; code: string; name: string }[];
  /** This store's accounts the money can land in. */
  accounts: { id: string; code: string; name: string }[];
}

/** The active ways to take money and the store's active accounts - shared by every screen that takes a payment. */
export async function paymentOptionsInTx(
  tx: TenantTx,
  actor: CapabilityActor,
  storeId: string,
): Promise<TillPaymentOptionsDto> {
  const [methods, accounts] = await Promise.all([
    tx.payment_methods.findMany({
      where: { tenant_id: actor.tenantId, status: "active", is_customer_credit: false },
      orderBy: { created_at: "asc" },
      select: { id: true, code: true, name: true },
    }),
    tx.payment_accounts.findMany({
      where: { tenant_id: actor.tenantId, store_id: storeId, status: "active" },
      orderBy: { created_at: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
  return { methods, accounts };
}

/**
 * What the till offers at checkout - under "pos:view", so a cashier can take payments without
 * needing access to Settings (where the full lists, including switched-off ones, are managed).
 */
export const listTillPaymentOptions = defineCapability<
  ListTillPaymentOptionsInput,
  TillPaymentOptionsDto
>({
  name: "listTillPaymentOptions",
  kind: "read",
  requiredPermission: "pos:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => paymentOptionsInTx(tx, actor, input.storeId));
  },
});

/** The same lists for the Customers screen, where a payment from a customer is received. */
export const listCustomerPaymentOptions = defineCapability<
  ListTillPaymentOptionsInput,
  TillPaymentOptionsDto
>({
  name: "listCustomerPaymentOptions",
  kind: "read",
  requiredPermission: "customers:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => paymentOptionsInTx(tx, actor, input.storeId));
  },
});

/** The same lists for the sale page, where a return is paid back out of an account. */
export const listSaleRefundOptions = defineCapability<
  ListTillPaymentOptionsInput,
  TillPaymentOptionsDto
>({
  name: "listSaleRefundOptions",
  kind: "read",
  requiredPermission: "sales:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => paymentOptionsInTx(tx, actor, input.storeId));
  },
});
