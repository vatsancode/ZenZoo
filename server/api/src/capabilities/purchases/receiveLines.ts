import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";
import { generateBarcode } from "./barcode";

export interface ReceiveLineInput {
  purchaseItemId: string;
  quantity: number;
}

export interface ReceiveLinesInput {
  purchaseId: string;
  deliveryDate: string;
  lines: ReceiveLineInput[];
}

/**
 * The part of "receive stock" that's really just "log what arrived and
 * raise the count" - shared by receivePurchase (one or more deliveries
 * against an already-ordered purchase) and recordReceivedPurchase (one
 * full delivery against a purchase it just placed itself, in the same
 * transaction). One implementation, so a change to how a delivery is
 * recorded - a new field, a new check - only has to happen once.
 */
export async function receiveLines(
  tx: TenantTx,
  actor: CapabilityActor,
  input: ReceiveLinesInput,
): Promise<void> {
  const lines = input.lines.filter((line) => line.quantity > 0);
  if (lines.length === 0) throw new Error("Enter how much arrived.");

  const purchase = await tx.purchases.findFirst({
    where: { id: input.purchaseId, tenant_id: actor.tenantId },
    select: { store_id: true, status: true },
  });
  if (!purchase) throw new Error("That purchase doesn't exist.");

  if (purchase.status === "draft") {
    throw new Error("Place the order before receiving stock.");
  }
  if (purchase.status === "cancelled") {
    throw new Error("This purchase was cancelled.");
  }

  const deliveryDate = new Date(input.deliveryDate);

  for (const line of lines) {
    const item = await tx.purchase_items.findFirst({
      where: { id: line.purchaseItemId, purchase_id: input.purchaseId, tenant_id: actor.tenantId },
      select: {
        id: true,
        variant_id: true,
        quantity: true,
        unit_cost: true,
        inventory_batches: { select: { received_quantity: true } },
      },
    });
    if (!item) throw new Error("One of these lines doesn't belong to this purchase.");

    const alreadyReceived = item.inventory_batches.reduce(
      (sum, batch) => sum + batch.received_quantity,
      0,
    );
    const pending = item.quantity - alreadyReceived;
    if (line.quantity > pending) {
      throw new Error(`Only ${pending} still to come on one of these lines.`);
    }

    const batch = await tx.inventory_batches.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: purchase.store_id,
        variant_id: item.variant_id,
        purchase_item_id: item.id,
        barcode: generateBarcode(),
        received_quantity: line.quantity,
        unit_cost: item.unit_cost,
        received_at: deliveryDate,
      },
      select: { id: true },
    });

    // This is what actually raises available_quantity -
    // trg_stock_movements_apply_to_batch reads this row, the application
    // never writes available_quantity directly.
    await tx.stock_movements.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: purchase.store_id,
        variant_id: item.variant_id,
        batch_id: batch.id,
        movement_type: "PURCHASED",
        quantity: line.quantity,
        reference_type: "PURCHASE_ITEM",
        reference_id: item.id,
        occurred_at: deliveryDate,
        created_by: actor.userId,
      },
    });
  }

  if (purchase.status === "ordered") {
    await tx.purchases.update({
      where: { id: input.purchaseId },
      data: { status: "received", received_at: deliveryDate },
    });
  }
}
