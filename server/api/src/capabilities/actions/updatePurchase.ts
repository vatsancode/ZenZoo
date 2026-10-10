import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PURCHASE_SELECT, toPurchaseDto, type PurchaseDto } from "../purchases/dto";
import { computeTotals, type PurchaseLineInput } from "../purchases/totals";

export interface UpdatePurchaseInput {
  id: string;
  supplierId: string;
  referenceNumber?: string;
  purchaseDate: string;
  adjustmentAmount?: number;
  items: PurchaseLineInput[];
}

/** Replaces the header and every line wholesale - only while still draft, matching the admin UI's own restriction. */
export const updatePurchase = defineCapability<UpdatePurchaseInput, PurchaseDto>({
  name: "updatePurchase",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    if (input.items.length === 0) throw new Error("Add at least one line to the purchase.");
    for (const item of input.items) {
      if (item.quantity <= 0) throw new Error("Quantity must be more than zero.");
      if (item.unitCost < 0) throw new Error("Cost can't be negative.");
    }

    const totals = computeTotals(input.items, input.adjustmentAmount ?? 0);

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.purchases.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { store_id: true, status: true },
        });
        if (!existing) throw new Error("That purchase doesn't exist.");
        await assertStoreAccess(actor, existing.store_id);
        if (existing.status !== "draft") {
          throw new Error("Only a draft purchase can be edited.");
        }

        const supplier = await tx.suppliers.findFirst({
          where: { id: input.supplierId, tenant_id: actor.tenantId },
          select: { id: true },
        });
        if (!supplier) throw new Error("That supplier doesn't exist.");

        for (const line of totals.lines) {
          const variant = await tx.variants.findFirst({
            where: { id: line.variantId, tenant_id: actor.tenantId, store_id: existing.store_id },
            select: { id: true },
          });
          if (!variant) throw new Error("One of these products doesn't belong to this store.");
        }

        await tx.purchases.update({
          where: { id: input.id },
          data: {
            supplier_id: input.supplierId,
            reference_number: input.referenceNumber?.trim() || null,
            purchase_date: new Date(input.purchaseDate),
            subtotal_amount: totals.subtotalAmount,
            discount_amount: totals.discountAmount,
            tax_amount: totals.taxAmount,
            adjustment_amount: input.adjustmentAmount ?? 0,
            total_amount: totals.totalAmount,
          },
        });

        // Wholesale replace - safe while draft, since no inventory_batches
        // can exist yet to reference these purchase_items rows.
        await tx.purchase_items.deleteMany({ where: { purchase_id: input.id } });
        await tx.purchase_items.createMany({
          data: totals.lines.map((line) => ({
            tenant_id: actor.tenantId,
            store_id: existing.store_id,
            purchase_id: input.id,
            variant_id: line.variantId,
            quantity: line.quantity,
            unit_cost: line.unitCost,
            discount_amount: line.discountAmount,
            tax_amount: line.taxAmount,
            line_total: line.lineTotal,
          })),
        });

        const row = await tx.purchases.findUniqueOrThrow({
          where: { id: input.id },
          select: PURCHASE_SELECT,
        });
        return toPurchaseDto(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("This supplier already has a purchase with that reference number.");
      }
      throw error;
    }
  },
});
