import type { CapabilityActor } from "@zenzoo/types";
import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext, type TenantTx } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { sortByPlacement } from "../../shared/placement";

export interface ListTillPaymentOptionsInput {
  storeId: string;
}

const storeInput = z.object({
  storeId: z.string().describe("The store's id, from listStores."),
});

const PAYMENT_OPTIONS_NOTE =
  "Returns two lists: the active ways to take money (methods, such as cash or UPI; customer credit is left out because it is not money received) and the store's active accounts the money can land in. Get storeId from listStores.";

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
  const [methodRows, accounts] = await Promise.all([
    tx.payment_methods.findMany({
      where: { tenant_id: actor.tenantId, status: "active", is_customer_credit: false },
      select: { id: true, code: true, name: true, sort_order: true },
    }),
    tx.payment_accounts.findMany({
      where: { tenant_id: actor.tenantId, store_id: storeId, status: "active" },
      orderBy: { created_at: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
  const methods = sortByPlacement(methodRows).map(({ id, code, name }) => ({ id, code, name }));
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
  description: `What the till offers at checkout. ${PAYMENT_OPTIONS_NOTE}`,
  input: storeInput,
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
  description: `The same options, for receiving a payment from a customer. ${PAYMENT_OPTIONS_NOTE}`,
  input: storeInput,
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
  description: `The same options, for paying a sale's return back out of an account. ${PAYMENT_OPTIONS_NOTE}`,
  input: storeInput,
  requiredPermission: "sales:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => paymentOptionsInTx(tx, actor, input.storeId));
  },
});
