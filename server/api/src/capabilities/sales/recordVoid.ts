import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";
import { ConflictError } from "../capability";
import { lockCustomer } from "../customers/ledger";
import type { SaleDto } from "./dto";
import { friendlyDatabaseError, lockSale } from "./recordReturn";
import { findSale } from "./recordSale";

export interface RecordVoidInput {
  storeId: string;
  saleId: string;
  /** Why the sale is being cancelled - kept with it. */
  reason: string;
}

/**
 * Cancels a completed sale, all or nothing (the caller runs this inside one transaction): every
 * unit goes back into the batch it came out of, whatever was put on the customer's account is
 * reversed, and the payments leave the accounts they came into (the database does that last part
 * when the sale flips to voided). The sale and its receipt number stay on record, marked voided -
 * a number once printed is never reused.
 *
 * A sale that already has a return can't be voided: the return has put part of it back already,
 * and doing both would restore the same units twice.
 */
export async function recordVoid(
  tx: TenantTx,
  actor: CapabilityActor,
  input: RecordVoidInput,
): Promise<SaleDto> {
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new Error("Say why the sale is being cancelled.");

  await lockSale(tx, input.saleId);
  const sale = await tx.sales.findFirst({
    where: { id: input.saleId, tenant_id: actor.tenantId, store_id: input.storeId },
    select: { status: true, customer_id: true },
  });
  if (!sale) throw new Error("That sale doesn't exist.");

  // Cancelling twice (a double-click, a retry) is not an error - hand back the sale as it is.
  if (sale.status === "voided") {
    const done = await findSale(tx, actor, input.storeId, input.saleId);
    if (done) return done;
  }
  if (sale.status !== "completed")
    throw new ConflictError("Only a completed sale can be cancelled.");

  const returns = await tx.sale_returns.count({
    where: { sale_id: input.saleId, tenant_id: actor.tenantId, status: "completed" },
  });
  if (returns > 0) {
    throw new ConflictError("This sale has items returned already, so it can't be cancelled.");
  }

  // Every unit back into the batch it came from.
  const allocations = await tx.sale_item_batches.findMany({
    where: { tenant_id: actor.tenantId, sale_items: { sale_id: input.saleId } },
    orderBy: { id: "asc" },
    select: { sale_item_id: true, variant_id: true, batch_id: true, quantity: true },
  });
  const now = new Date();
  for (const allocation of allocations) {
    await tx.stock_movements.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        variant_id: allocation.variant_id,
        batch_id: allocation.batch_id,
        movement_type: "SOLD_REVERSAL",
        quantity: allocation.quantity,
        reference_type: "SALE_ITEM",
        reference_id: allocation.sale_item_id,
        occurred_at: now,
        created_by: actor.userId,
      },
    });
  }

  // Anything put on the customer's account (pay later, store credit spent) is reversed exactly.
  const onAccount = await tx.customer_credit_ledger.findMany({
    where: { tenant_id: actor.tenantId, sale_id: input.saleId, entry_type: "CREDIT_SALE" },
    orderBy: { id: "asc" },
    select: { id: true, customer_id: true, amount: true },
  });
  if (onAccount.length > 0 && sale.customer_id) await lockCustomer(tx, sale.customer_id);
  for (const entry of onAccount) {
    await tx.customer_credit_ledger.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        customer_id: entry.customer_id,
        sale_id: input.saleId,
        entry_type: "CREDIT_REVERSAL",
        amount: entry.amount.negated().toFixed(2),
        reverses_entry_id: entry.id,
        notes: "Sale cancelled",
        created_by: actor.userId,
      },
    });
  }

  try {
    // void_reason can only be set by this very update (the sales guard enforces it).
    await tx.sales.update({
      where: { id: input.saleId },
      data: { status: "voided", void_reason: reason },
    });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
  } catch (error) {
    friendlyDatabaseError(error);
  }

  const saved = await findSale(tx, actor, input.storeId, input.saleId);
  if (!saved) throw new Error("The sale could not be read back after cancelling.");
  return saved;
}
