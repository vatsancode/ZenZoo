import { PricingError, returnValue, toPaise, type Paise } from "@zenzoo/pricing";
import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";
import { ConflictError } from "../capability";
import { lockCustomer } from "../customers/ledger";
import { generateBarcode } from "../purchases/barcode";
import type { SaleDto } from "./dto";
import { money } from "./pricing";
import { findSale } from "./recordSale";

export type RefundMode = "money" | "credit" | "none";

export interface RecordReturnInput {
  storeId: string;
  saleId: string;
  /** Made by the till, so a retried request finds the return it already saved instead of making a second. */
  id: string;
  reason: string;
  note?: string;
  /** What is coming back: whole units of the sale's lines. */
  items: { saleItemId: string; quantity: number }[];
  refund: {
    mode: RefundMode;
    /** Rupees. Leave out for the full value of the goods; give less to refund only part. */
    amount?: number | string;
    /** For "money": how it is paid back, and the account it leaves. */
    paymentMethodId?: string;
    paymentAccountId?: string;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RETURN_RECEIPT_PREFIX = "RET";

/** Per-sale lock: returns and voids on the same sale take turns. */
export async function lockSale(tx: TenantTx, saleId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sale:${saleId}`}, 0))`;
}

/** Turns the database's own refusal into a sentence a cashier can act on. */
export function friendlyDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (/not enough balance/i.test(message)) {
    throw new ConflictError(
      "That account doesn't have enough money in it for this. Move money into it first (Settings > Accounts > Transfers), then try again.",
    );
  }
  throw error;
}

/**
 * Takes goods back, all or nothing (the caller runs this inside one transaction): checks what can
 * still come back, puts the units back into new batches at the cost they left at, and makes the
 * customer whole - money out of an account, store credit in their ledger, or nothing. The
 * database's guards re-verify the whole thing at the end.
 */
export async function recordReturn(
  tx: TenantTx,
  actor: CapabilityActor,
  input: RecordReturnInput,
): Promise<SaleDto> {
  if (typeof input.id !== "string" || !UUID.test(input.id))
    throw new Error("The return needs an id.");

  // A retry of a return that already went through: hand back the sale as it is now.
  const existing = await tx.sale_returns.findFirst({
    where: { id: input.id, tenant_id: actor.tenantId },
    select: { sale_id: true, store_id: true },
  });
  if (existing) {
    if (existing.sale_id !== input.saleId || existing.store_id !== input.storeId) {
      throw new ConflictError("That return id is already in use.");
    }
    const again = await findSale(tx, actor, input.storeId, input.saleId);
    if (again) return again;
  }

  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new Error("Choose a reason for the return.");
  if (reason.length > 500) throw new Error("That reason is too long.");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Choose what is coming back.");
  }

  await lockSale(tx, input.saleId);
  const sale = await tx.sales.findFirst({
    where: { id: input.saleId, tenant_id: actor.tenantId, store_id: input.storeId },
    select: { status: true, customer_id: true },
  });
  if (!sale) throw new Error("That sale doesn't exist.");
  if (sale.status !== "completed")
    throw new ConflictError("This sale has been cancelled, so nothing can be returned.");

  const lines = await tx.sale_items.findMany({
    where: { sale_id: input.saleId, tenant_id: actor.tenantId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      variant_id: true,
      quantity: true,
      line_total: true,
      variants: { select: { name: true, sellables: { select: { name: true } } } },
      sale_item_batches: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantity: true,
          inventory_batches: { select: { unit_cost: true } },
          sale_return_items: {
            where: { sale_returns: { status: "completed" } },
            select: { quantity: true },
          },
        },
      },
    },
  });
  const lineById = new Map(lines.map((line) => [line.id, line]));

  // What each requested line comes to, and which original batches the units go back against.
  const pieces: {
    saleItemId: string;
    variantId: string;
    saleItemBatchId: string;
    quantity: number;
    unitCost: string;
    value: Paise;
  }[] = [];
  let totalValue: Paise = 0;
  const seen = new Set<string>();

  for (const request of input.items) {
    const line = lineById.get(request.saleItemId);
    if (!line) throw new Error("One of the items isn't on this sale.");
    if (seen.has(line.id)) throw new Error("An item is listed twice.");
    seen.add(line.id);

    const label =
      line.variants.name === line.variants.sellables.name
        ? line.variants.name
        : `${line.variants.sellables.name} - ${line.variants.name}`;
    if (!Number.isInteger(request.quantity) || request.quantity < 1) {
      throw new Error(`Enter a whole number of ${label} to return.`);
    }
    // Made-to-order items have no stock to put back (and the return tables work per stock batch).
    if (line.sale_item_batches.length === 0) {
      throw new Error(
        `${label} is a service, not stock, so it can't be returned. Cancel the sale instead.`,
      );
    }

    const returnedBefore = line.sale_item_batches.reduce(
      (sum, batch) =>
        sum + batch.sale_return_items.reduce((inner, item) => inner + item.quantity, 0),
      0,
    );
    const left = line.quantity - returnedBefore;
    if (request.quantity > left) {
      throw new ConflictError(
        left === 0
          ? `${label} has already been returned.`
          : `Only ${left} of ${label} can still be returned.`,
      );
    }

    let lineValue: Paise;
    try {
      lineValue = returnValue(
        toPaise(line.line_total.toString()),
        line.quantity,
        returnedBefore,
        request.quantity,
      );
    } catch (error) {
      if (error instanceof PricingError) throw new Error(error.message);
      throw error;
    }

    // Walk the line's batches in the order they were sold from, taking what each has left to give back.
    let toTake = request.quantity;
    let valueGiven = 0;
    for (const batch of line.sale_item_batches) {
      if (toTake === 0) break;
      const back = batch.sale_return_items.reduce((sum, item) => sum + item.quantity, 0);
      const take = Math.min(batch.quantity - back, toTake);
      if (take <= 0) continue;
      // Spread the line's value over its pieces so they add up to it exactly.
      const value = returnValue(lineValue, request.quantity, request.quantity - toTake, take);
      pieces.push({
        saleItemId: line.id,
        variantId: line.variant_id,
        saleItemBatchId: batch.id,
        quantity: take,
        unitCost: batch.inventory_batches.unit_cost.toString(),
        value,
      });
      valueGiven += value;
      toTake -= take;
    }
    if (toTake > 0) throw new ConflictError(`Not enough of ${label} left to return.`);
    totalValue += valueGiven;
  }

  // The refund: how much, and how the customer is made whole.
  const mode = input.refund?.mode;
  if (mode !== "money" && mode !== "credit" && mode !== "none")
    throw new Error("Choose how the customer is refunded.");
  let refund: Paise = 0;
  if (mode !== "none") {
    if (input.refund.amount === undefined || input.refund.amount === "") {
      refund = totalValue;
    } else {
      try {
        refund = toPaise(input.refund.amount);
      } catch (error) {
        if (error instanceof PricingError) throw new Error("Enter the refund amount.");
        throw error;
      }
    }
    if (!(refund > 0)) throw new Error("Enter the refund amount.");
    if (refund > totalValue) {
      throw new Error(
        `The refund can't be more than the ₹${money(totalValue)} the goods were worth.`,
      );
    }
  }

  let methodId: string | null = null;
  let accountId: string | null = null;
  if (mode === "money") {
    // A missing id must never reach the lookup: an undefined filter matches everything.
    if (!input.refund.paymentMethodId) throw new Error("Choose how the refund is paid.");
    if (!input.refund.paymentAccountId)
      throw new Error("Choose the account the refund is paid from.");
    const method = await tx.payment_methods.findFirst({
      where: {
        id: input.refund.paymentMethodId,
        tenant_id: actor.tenantId,
        status: "active",
        is_customer_credit: false,
      },
      select: { id: true },
    });
    if (!method) throw new Error("Choose how the refund is paid.");
    const account = await tx.payment_accounts.findFirst({
      where: {
        id: input.refund.paymentAccountId,
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        status: "active",
      },
      select: { id: true },
    });
    if (!account) throw new Error("Choose the account the refund is paid from.");
    methodId = method.id;
    accountId = account.id;
  }
  if (mode === "credit") {
    if (!sale.customer_id) throw new Error("Store credit needs a customer on the sale.");
    await lockCustomer(tx, sale.customer_id);
  }

  // Draft first: the return's lines only accept rows while it is a draft.
  await tx.sale_returns.create({
    data: {
      id: input.id,
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      sale_id: input.saleId,
      status: "draft",
      reason,
      note: input.note?.trim() || null,
      value_amount: money(totalValue),
      refund_mode: mode,
      refund_amount: money(refund),
      refund_method_id: methodId,
      refund_account_id: accountId,
      created_by: actor.userId,
    },
  });

  const now = new Date();
  for (const piece of pieces) {
    const item = await tx.sale_return_items.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        variant_id: piece.variantId,
        sale_return_id: input.id,
        sale_item_id: piece.saleItemId,
        sale_item_batch_id: piece.saleItemBatchId,
        quantity: piece.quantity,
        value_amount: money(piece.value),
      },
      select: { id: true },
    });
    // The units go back as a new batch at the cost they left at, with the movement that raises stock.
    const batch = await tx.inventory_batches.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        variant_id: piece.variantId,
        sale_return_item_id: item.id,
        barcode: generateBarcode(),
        received_quantity: piece.quantity,
        unit_cost: piece.unitCost,
        received_at: now,
      },
      select: { id: true },
    });
    await tx.stock_movements.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        variant_id: piece.variantId,
        batch_id: batch.id,
        movement_type: "SALE_RETURN",
        quantity: piece.quantity,
        reference_type: "SALE_RETURN",
        reference_id: item.id,
        occurred_at: now,
        created_by: actor.userId,
      },
    });
  }

  if (mode === "credit" && sale.customer_id) {
    await tx.customer_credit_ledger.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        customer_id: sale.customer_id,
        sale_id: input.saleId,
        sale_return_id: input.id,
        entry_type: "CREDIT_ADJUSTMENT",
        // Negative: the shop owes the customer (or they owe it less).
        amount: money(-refund),
        notes: "Store credit from a return",
        created_by: actor.userId,
      },
    });
  }

  const [slip] = await tx.$queryRaw<{ number: string }[]>`
    SELECT next_receipt_number(${actor.tenantId}::uuid, ${input.storeId}::uuid, ${RETURN_RECEIPT_PREFIX}) AS number`;
  if (!slip) throw new Error("Couldn't number the credit slip.");
  try {
    await tx.sale_returns.update({
      where: { id: input.id },
      data: { return_number: slip.number, status: "completed" },
    });
    // The refund leaves its account and the guards run when the return completes; run them now so
    // a problem is raised here, against this return.
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
  } catch (error) {
    friendlyDatabaseError(error);
  }

  const saved = await findSale(tx, actor, input.storeId, input.saleId);
  if (!saved) throw new Error("The sale could not be read back after the return.");
  return saved;
}
