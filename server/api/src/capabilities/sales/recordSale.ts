import { PricingError, toPaise, type Paise } from "@zenzoo/pricing";
import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";
import { ConflictError } from "../capability";
import { SALE_SELECT, toSaleDto, type SaleDto } from "./dto";
import { customerBalance, creditMethods, lockCustomer } from "../customers/ledger";
import { money, priceSale, type SalePricingInput } from "./pricing";

export interface SalePaymentInput {
  paymentMethodId: string;
  paymentAccountId: string;
  /** Rupees. */
  amount: number | string;
  reference?: string;
}

export interface RecordSaleInput extends SalePricingInput {
  /** Made by the till, so a retried upload finds the sale it already saved instead of making a second. */
  id: string;
  customerId?: string;
  /** When the sale happened - defaults to now. */
  occurredAt?: string;
  discountReason?: string;
  /** The total the cashier saw. If the real total differs, nothing is saved. */
  expectedTotal: number | string;
  /** Money taken now, into real accounts. */
  payments: SalePaymentInput[];
  /**
   * Rupees paid with the customer's store credit (what the shop already owes them). Needs a
   * customer, and can't be more than the credit they hold.
   */
  storeCreditAmount?: number | string;
  /** Rupees left to pay later - added to what the customer owes the shop. Needs a customer. */
  onAccountAmount?: number | string;
}

/** Receipt prefix per till. The admin web till is "A"; the native POS will get its own. */
export const ADMIN_RECEIPT_PREFIX = "A";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Finds a sale already saved under this id - the "already done, here it is" half of a safe retry. */
export async function findSale(
  tx: TenantTx,
  actor: CapabilityActor,
  storeId: string,
  id: string,
): Promise<SaleDto | null> {
  const row = await tx.sales.findFirst({
    where: { id, tenant_id: actor.tenantId },
    select: SALE_SELECT,
  });
  if (!row) return null;
  if (row.store_id !== storeId) throw new ConflictError("That sale id is already in use.");
  return toSaleDto(row);
}

function paiseOf(value: number | string | undefined, what: string): Paise {
  if (value === undefined || value === null || value === "") throw new Error(`${what} is missing.`);
  try {
    return toPaise(value);
  } catch (error) {
    if (error instanceof PricingError) throw new Error(`${what} isn't a valid amount.`);
    throw error;
  }
}

/**
 * Makes sales of the same items take turns. The app's database role can't lock inventory_batches
 * rows itself (it may not update them - only the stock-movement trigger does), so this takes a
 * per-item advisory lock held until the transaction ends. Two tills selling the last piece at
 * once then queue up: the second one reads the stock after the first has committed, finds
 * nothing left, and is told so - instead of hitting a raw "stock can't go negative" error.
 * Locks are taken in sorted order so two multi-item carts can never wait on each other.
 */
async function lockItems(tx: TenantTx, variantIds: string[]) {
  for (const id of [...new Set(variantIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
  }
}

/** Takes stock for a sold line from its oldest batches first (lockItems must already be held). */
async function takeStock(
  tx: TenantTx,
  actor: CapabilityActor,
  storeId: string,
  line: { saleItemId: string; variantId: string; label: string; quantity: number },
  soldAt: Date,
) {
  const batches = await tx.$queryRaw<{ id: string; available_quantity: number }[]>`
    SELECT id, available_quantity
      FROM inventory_batches
     WHERE tenant_id = ${actor.tenantId}::uuid
       AND store_id = ${storeId}::uuid
       AND variant_id = ${line.variantId}::uuid
       AND available_quantity > 0
     ORDER BY received_at ASC, id ASC`;

  const have = batches.reduce((sum, batch) => sum + batch.available_quantity, 0);
  if (have < line.quantity) {
    throw new ConflictError(
      have === 0 ? `${line.label} is out of stock.` : `Only ${have} of ${line.label} left.`,
    );
  }

  let remaining = line.quantity;
  for (const batch of batches) {
    if (remaining === 0) break;
    const take = Math.min(batch.available_quantity, remaining);
    await tx.sale_item_batches.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: storeId,
        variant_id: line.variantId,
        sale_item_id: line.saleItemId,
        batch_id: batch.id,
        quantity: take,
      },
    });
    await tx.stock_movements.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: storeId,
        variant_id: line.variantId,
        batch_id: batch.id,
        movement_type: "SOLD",
        quantity: take,
        reference_type: "SALE_ITEM",
        reference_id: line.saleItemId,
        occurred_at: soldAt,
        created_by: actor.userId,
      },
    });
    remaining -= take;
  }
}

/**
 * Saves a completed sale, all or nothing (the caller runs this inside one transaction):
 * prices it from the database, checks the total against what the cashier saw, writes the sale,
 * takes stock oldest-batch-first, records the payments, numbers the receipt and completes it.
 * The database's own triggers re-verify the whole thing at the end as a safety net.
 */
export async function recordSale(
  tx: TenantTx,
  actor: CapabilityActor,
  input: RecordSaleInput,
): Promise<SaleDto> {
  if (typeof input.id !== "string" || !UUID.test(input.id))
    throw new Error("The sale needs an id.");

  // A retry of a sale that already went through: hand back what was saved, change nothing.
  const already = await findSale(tx, actor, input.storeId, input.id);
  if (already) return already;

  if (input.customerId) {
    const customer = await tx.customers.findFirst({
      where: { id: input.customerId, tenant_id: actor.tenantId, status: "active" },
      select: { id: true },
    });
    if (!customer) throw new Error("That customer doesn't exist, or has been archived.");
  }

  const priced = await priceSale(tx, actor, input);
  const { cart } = priced;

  if (input.expectedTotal === undefined || input.expectedTotal === null) {
    throw new Error("Send the total the cashier saw, so it can be checked.");
  }
  const expected = paiseOf(input.expectedTotal, "The total");
  if (expected !== cart.total) {
    throw new ConflictError(
      `The prices have changed - the bill is now ₹${money(cart.total)}, not ₹${money(expected)}. Please review it.`,
    );
  }

  // Payments: real, active, into this store's accounts, plus whatever goes on the customer's
  // account - together exactly the total.
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const paid = payments.map((payment) => paiseOf(payment.amount, "A payment amount"));
  if (paid.some((amount) => amount <= 0)) throw new Error("Every payment must be more than zero.");
  const optional = (value: number | string | undefined, what: string): Paise => {
    if (value === undefined || value === null || value === "" || Number(value) === 0) return 0;
    const amount = paiseOf(value, what);
    if (amount < 0) throw new Error(`${what} can't be negative.`);
    return amount;
  };
  const storeCredit = optional(input.storeCreditAmount, "The store credit amount");
  const onAccount = optional(input.onAccountAmount, "The pay-later amount");
  const paidTotal = paid.reduce((sum, amount) => sum + amount, 0) + storeCredit + onAccount;
  if (paidTotal !== cart.total) {
    throw new Error(
      `The payments add up to ₹${money(paidTotal)} but the bill is ₹${money(cart.total)}.`,
    );
  }

  const methodIds = [...new Set(payments.map((payment) => payment.paymentMethodId))];
  const methods = await tx.payment_methods.findMany({
    where: { id: { in: methodIds }, tenant_id: actor.tenantId, status: "active" },
    select: { id: true, is_customer_credit: true },
  });
  if (methods.length !== methodIds.length)
    throw new Error("One of the payment methods isn't available.");
  if (methods.some((method) => method.is_customer_credit)) {
    throw new Error("Use the store credit and pay-later amounts for those, not a payment method.");
  }
  const accountIds = [...new Set(payments.map((payment) => payment.paymentAccountId))];
  const accounts = await tx.payment_accounts.findMany({
    where: {
      id: { in: accountIds },
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      status: "active",
    },
    select: { id: true },
  });
  if (accounts.length !== accountIds.length)
    throw new Error("One of the payment accounts isn't available.");

  // Putting part of the bill on the customer's account: who, and how much they can.
  let credit: { storeCredit: string | null; onAccount: string | null } | undefined;
  if (storeCredit > 0 || onAccount > 0) {
    if (!input.customerId)
      throw new Error("Choose a customer to put part of the bill on their account.");
    credit = await creditMethods(tx, actor.tenantId);
    if (storeCredit > 0 && !credit.storeCredit)
      throw new Error("Store credit is switched off in Settings.");
    if (onAccount > 0 && !credit.onAccount)
      throw new Error("Paying later is switched off in Settings.");
    // Anything that changes this customer's balance takes turns, so two tills can't both spend the
    // same store credit.
    await lockCustomer(tx, input.customerId);
    const balance = await customerBalance(tx, actor.tenantId, input.customerId);
    const available = Math.max(-balance, 0);
    if (storeCredit > available) {
      throw new ConflictError(
        available === 0
          ? "This customer has no store credit to use."
          : `This customer only has ₹${money(available)} store credit.`,
      );
    }
    // The balance is one number, so owing and holding credit cancel out: anything put on account
    // while they hold credit would silently use it up. Make the till say so rather than label
    // that "pay later".
    if (onAccount > 0 && available - storeCredit > 0) {
      throw new Error(
        `This customer has ₹${money(available - storeCredit)} store credit left - use it before putting anything on account.`,
      );
    }
  }

  let soldAt = new Date();
  if (input.occurredAt !== undefined) {
    soldAt = new Date(input.occurredAt);
    if (Number.isNaN(soldAt.getTime())) throw new Error("The sale time isn't valid.");
    if (soldAt.getTime() > Date.now() + 60 * 60 * 1000)
      throw new Error("The sale time is in the future.");
  }

  // Draft first: the line, batch and payment tables only accept rows for a draft sale.
  await tx.sales.create({
    data: {
      id: input.id,
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      customer_id: input.customerId ?? null,
      sold_at: soldAt,
      subtotal_amount: money(cart.subtotal),
      discount_amount: money(cart.lineDiscounts + cart.billDiscount),
      total_amount: money(cart.total),
      bill_discount_type: priced.typedBillDiscount?.type ?? null,
      bill_discount_value: priced.typedBillDiscount?.value ?? null,
      bill_discount_amount: money(cart.billDiscount),
      discount_reason: input.discountReason?.trim() || null,
      source: "admin",
      created_by: actor.userId,
    },
  });

  await lockItems(
    tx,
    priced.lines.filter((line) => line.kind === "product").map((line) => line.variantId),
  );

  for (const [index, line] of priced.lines.entries()) {
    const amounts = cart.lines[index]!;
    const item = await tx.sale_items.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        sale_id: input.id,
        variant_id: line.variantId,
        quantity: line.quantity,
        unit_price: money(line.unitPrice),
        discount_amount: money(amounts.discount),
        bill_discount_share: money(amounts.billShare),
        line_discount_type: line.typedDiscount?.type ?? null,
        line_discount_value: line.typedDiscount?.value ?? null,
        line_total: money(amounts.net),
      },
      select: { id: true },
    });

    // Made-to-order items aren't counted, so there is no stock to take.
    if (line.kind === "product") {
      const label =
        line.variantName === line.productName
          ? line.productName
          : `${line.productName} - ${line.variantName}`;
      await takeStock(
        tx,
        actor,
        input.storeId,
        { saleItemId: item.id, variantId: line.variantId, label, quantity: line.quantity },
        soldAt,
      );
    }
  }

  for (const [index, payment] of payments.entries()) {
    await tx.sale_payments.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        sale_id: input.id,
        payment_method_id: payment.paymentMethodId,
        payment_account_id: payment.paymentAccountId,
        amount: money(paid[index]!),
        received_at: soldAt,
        reference: payment.reference?.trim() || null,
        created_by: actor.userId,
      },
    });
  }

  // The part on the customer's account: a payment naming no account, and the ledger entry that
  // adds it to what they owe (store credit spent is the same entry - it just brings a negative
  // balance back up towards zero).
  if (credit && input.customerId) {
    for (const [methodId, amount] of [
      [credit.storeCredit, storeCredit],
      [credit.onAccount, onAccount],
    ] as const) {
      if (amount <= 0 || !methodId) continue;
      const payment = await tx.sale_payments.create({
        data: {
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          sale_id: input.id,
          payment_method_id: methodId,
          payment_account_id: null,
          amount: money(amount),
          received_at: soldAt,
          created_by: actor.userId,
        },
        select: { id: true },
      });
      await tx.customer_credit_ledger.create({
        data: {
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          customer_id: input.customerId,
          sale_id: input.id,
          sale_payment_id: payment.id,
          entry_type: "CREDIT_SALE",
          amount: money(amount),
          created_by: actor.userId,
        },
      });
    }
  }

  // Taken inside this transaction, so a sale that fails leaves no gap in the numbers.
  const [receipt] = await tx.$queryRaw<{ number: string }[]>`
    SELECT next_receipt_number(${actor.tenantId}::uuid, ${input.storeId}::uuid, ${ADMIN_RECEIPT_PREFIX}) AS number`;
  if (!receipt) throw new Error("Couldn't number the receipt.");
  await tx.sales.update({
    where: { id: input.id },
    data: { sale_number: receipt.number, status: "completed" },
  });

  // The database's totals and completion checks normally wait for COMMIT; run them now so a
  // problem is raised here, against this sale, rather than as a bare error at the very end.
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  // ...then back to deferred, so a caller saving several sales in one transaction isn't affected.
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");

  const saved = await findSale(tx, actor, input.storeId, input.id);
  if (!saved) throw new Error("The sale could not be read back after saving.");
  return saved;
}
