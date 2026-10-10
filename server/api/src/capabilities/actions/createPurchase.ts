import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PURCHASE_SELECT, toPurchaseDto, type PurchaseDto } from "../purchases/dto";
import { computeTotals, type PurchaseLineInput } from "../purchases/totals";

export interface CreatePurchaseInput {
  storeId: string;
  supplierId: string;
  referenceNumber?: string;
  purchaseDate: string;
  adjustmentAmount?: number;
  items: PurchaseLineInput[];
}

export const createPurchase = defineCapability<CreatePurchaseInput, PurchaseDto>({
  name: "createPurchase",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    if (input.items.length === 0) throw new Error("Add at least one line to the purchase.");
    for (const item of input.items) {
      if (item.quantity <= 0) throw new Error("Quantity must be more than zero.");
      if (item.unitCost < 0) throw new Error("Cost can't be negative.");
    }

    const totals = computeTotals(input.items, input.adjustmentAmount ?? 0);

    try {
      return await runInTenantContext(actor, async (tx) => {
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

        // Two steps, not a nested create - purchase_items' composite FK
        // needs tenant_id/store_id populated explicitly, same reasoning as
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
        await tx.purchase_items.createMany({
          data: totals.lines.map((line) => ({
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            purchase_id: purchase.id,
            variant_id: line.variantId,
            quantity: line.quantity,
            unit_cost: line.unitCost,
            discount_amount: line.discountAmount,
            tax_amount: line.taxAmount,
            line_total: line.lineTotal,
          })),
        });

        const row = await tx.purchases.findUniqueOrThrow({
          where: { id: purchase.id },
          select: PURCHASE_SELECT,
        });
        return toPurchaseDto(row);
      });
    } catch (error) {
      // idx_purchases_supplier_reference_unique
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("This supplier already has a purchase with that reference number.");
      }
      throw error;
    }
  },
});
