import type { CapabilityActor } from "@zenzoo/types";
import type { TenantTx } from "../../shared/tenantContext";
import { computeTotals, type PurchaseLineInput } from "./totals";

export interface CreateDraftPurchaseInput {
  storeId: string;
  supplierId: string;
  referenceNumber?: string;
  purchaseDate: string;
  adjustmentAmount?: number;
  items: PurchaseLineInput[];
}

/**
 * The part of "create a purchase" that's really just "insert a draft and
 * its lines" - shared by createPurchase (which stops here) and
 * recordReceivedPurchase (which keeps going: ordered, then received, all
 * in the same transaction). One implementation, so a change to how a
 * purchase is first written down - new validation, a new column - only
 * has to happen in one place to reach every caller, present or future.
 */
export async function createDraftPurchase(
  tx: TenantTx,
  actor: CapabilityActor,
  input: CreateDraftPurchaseInput,
): Promise<{ id: string; items: { id: string; variantId: string; quantity: number }[] }> {
  if (input.items.length === 0) throw new Error("Add at least one line to the purchase.");
  for (const item of input.items) {
    if (item.quantity <= 0) throw new Error("Quantity must be more than zero.");
    if (item.unitCost < 0) throw new Error("Cost can't be negative.");
  }

  const totals = computeTotals(input.items, input.adjustmentAmount ?? 0);

  const supplier = await tx.suppliers.findFirst({
    where: { id: input.supplierId, tenant_id: actor.tenantId },
    select: { id: true },
  });
  if (!supplier) throw new Error("That supplier doesn't exist.");

  for (const line of totals.lines) {
    const variant = await tx.variants.findFirst({
      where: { id: line.variantId, tenant_id: actor.tenantId, store_id: input.storeId },
      select: { id: true },
    });
    if (!variant) throw new Error("One of these products doesn't belong to this store.");
  }

  // Two steps, not a nested create - purchase_items' composite FK needs
  // tenant_id/store_id populated explicitly, same reasoning as
  // createRole/createProduct.
  const purchase = await tx.purchases.create({
    data: {
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      supplier_id: input.supplierId,
      reference_number: input.referenceNumber?.trim() || null,
      purchase_date: new Date(input.purchaseDate),
      status: "draft",
      subtotal_amount: totals.subtotalAmount,
      discount_amount: totals.discountAmount,
      tax_amount: totals.taxAmount,
      adjustment_amount: input.adjustmentAmount ?? 0,
      total_amount: totals.totalAmount,
    },
    select: { id: true },
  });

  // One create per line, not createMany - nothing stops the same variant
  // appearing on two lines (no unique constraint on purchase_id+variant_id),
  // and createMany doesn't hand back the rows it just inserted anyway. A
  // caller that needs each line's own id right away (recordReceivedPurchase,
  // to receive against it immediately) needs a reliable one-to-one mapping
  // back to the input it sent, not a re-query that can't tell two same-
  // variant lines apart.
  const items: { id: string; variantId: string; quantity: number }[] = [];
  for (const line of totals.lines) {
    const item = await tx.purchase_items.create({
      data: {
        tenant_id: actor.tenantId,
        store_id: input.storeId,
        purchase_id: purchase.id,
        variant_id: line.variantId,
        quantity: line.quantity,
        unit_cost: line.unitCost,
        discount_amount: line.discountAmount,
        tax_amount: line.taxAmount,
        line_total: line.lineTotal,
      },
      select: { id: true },
    });
    items.push({ id: item.id, variantId: line.variantId, quantity: line.quantity });
  }

  return { id: purchase.id, items };
}
