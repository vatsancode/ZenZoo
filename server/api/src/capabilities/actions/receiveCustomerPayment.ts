import { PricingError, toPaise } from "@zenzoo/pricing";
import { defineCapability, ConflictError } from "../capability";
import type { CapabilityActor } from "@zenzoo/types";
import { runInTenantContext, type TenantTx } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { customerBalance, lockCustomer } from "../customers/ledger";
import {
  PAYMENT_SELECT,
  toCustomerPaymentDto,
  type CustomerPaymentDto,
} from "../customers/paymentDto";

export interface ReceiveCustomerPaymentInput {
  storeId: string;
  customerId: string;
  /** Rupees received. */
  amount: number | string;
  paymentMethodId: string;
  /** The account the money went into. */
  paymentAccountId: string;
  reference?: string;
  note?: string;
}

export interface ReceiveCustomerPaymentResult {
  payment: CustomerPaymentDto;
  /** What they still owe after this payment: "50.00". */
  balance: string;
}

/** The payment's work, against an open transaction (so it can be tested without committing). */
export async function receivePaymentInTx(
  tx: TenantTx,
  actor: CapabilityActor,
  input: ReceiveCustomerPaymentInput,
): Promise<ReceiveCustomerPaymentResult> {
  let amount: number;
  try {
    amount = toPaise(input.amount);
  } catch (error) {
    if (error instanceof PricingError) throw new Error("Enter the amount received.");
    throw error;
  }
  if (!(amount > 0)) throw new Error("Enter an amount more than zero.");

  const customer = await tx.customers.findFirst({
    where: { id: input.customerId, tenant_id: actor.tenantId },
    select: { id: true },
  });
  if (!customer) throw new Error("That customer doesn't exist.");

  const method = await tx.payment_methods.findFirst({
    where: {
      id: input.paymentMethodId,
      tenant_id: actor.tenantId,
      status: "active",
      is_customer_credit: false,
    },
    select: { id: true, code: true, name: true },
  });
  if (!method) throw new Error("That payment method isn't available.");
  const account = await tx.payment_accounts.findFirst({
    where: {
      id: input.paymentAccountId,
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      status: "active",
    },
    select: { id: true, name: true },
  });
  if (!account) throw new Error("That account isn't available.");

  // Their balance can't move under us between reading it and writing the payment.
  await lockCustomer(tx, customer.id);
  const owed = await customerBalance(tx, actor.tenantId, customer.id);
  if (owed <= 0) throw new ConflictError("This customer doesn't owe anything.");
  if (amount > owed) {
    throw new ConflictError(`That is more than the ₹${(owed / 100).toFixed(2)} owed.`);
  }

  const row = await tx.customer_credit_ledger.create({
    data: {
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      customer_id: customer.id,
      entry_type: "CREDIT_PAYMENT",
      amount: (-amount / 100).toFixed(2),
      payment_method_id: method.id,
      payment_account_id: account.id,
      reference: input.reference?.trim() || null,
      notes: input.note?.trim() || null,
      created_by: actor.userId,
    },
    select: PAYMENT_SELECT,
  });

  return {
    payment: toCustomerPaymentDto(
      row,
      new Map([[method.id, { code: method.code, name: method.name }]]),
      new Map([[account.id, { name: account.name }]]),
    ),
    balance: ((owed - amount) / 100).toFixed(2),
  };
}

/**
 * A customer pays down what they owe. Writes a CREDIT_PAYMENT to their ledger, and the
 * database adds the money to the account it went into. Never more than they owe: an overpayment
 * would quietly become store credit, which should be a deliberate choice, not a typo.
 */
export const receiveCustomerPayment = defineCapability<
  ReceiveCustomerPaymentInput,
  ReceiveCustomerPaymentResult
>({
  name: "receiveCustomerPayment",
  kind: "action",
  requiredPermission: "customers:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => receivePaymentInTx(tx, actor, input));
  },
});
