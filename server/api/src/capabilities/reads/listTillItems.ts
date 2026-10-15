import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";

export interface ListTillItemsInput {
  storeId: string;
}

/** One thing the till can ring up - a single variant of a catalogue item. */
export interface TillItemDto {
  variantId: string;
  sellableId: string;
  /** "Product - Variant" when a product has several variants, else just the product's name. */
  name: string;
  sku: string | null;
  categoryName: string;
  kind: "product" | "made_to_order";
  price: string;
  /** Made-to-order items priced per order - price is entered at the till. */
  customPrice: boolean;
  unit: string;
  /** Units on hand across all batches; null for made-to-order items, which aren't counted. */
  onHand: number | null;
  /** Cost of the batch the next sale would draw from (oldest first), for the profit preview; null when none. */
  nextUnitCost: string | null;
}

/**
 * The till's item list: the catalogue (is_sellable, active), one row per
 * active variant. Stock comes from inventory_batches.available_quantity,
 * the same trigger-maintained number listCurrentStock reads.
 */
export const listTillItems = defineCapability<ListTillItemsInput, TillItemDto[]>({
  name: "listTillItems",
  kind: "read",
  requiredPermission: "pos:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    return runInTenantContext(actor, async (tx) => {
      const sellables = await tx.sellables.findMany({
        where: {
          tenant_id: actor.tenantId,
          store_id: input.storeId,
          is_sellable: true,
          status: "active",
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          kind: true,
          pricing_mode: true,
          categories: { select: { name: true } },
          variants: {
            where: { status: "active" },
            orderBy: { created_at: "asc" },
            select: {
              id: true,
              name: true,
              sku: true,
              base_price: true,
              units: { select: { code: true } },
              inventory_batches: {
                where: { available_quantity: { gt: 0 } },
                orderBy: { received_at: "asc" },
                select: { available_quantity: true, unit_cost: true },
              },
            },
          },
        },
      });

      return sellables.flatMap((sellable) =>
        sellable.variants.map((variant): TillItemDto => {
          const isProduct = sellable.kind === "product";
          const several = sellable.variants.length > 1;
          return {
            variantId: variant.id,
            sellableId: sellable.id,
            name: several ? `${sellable.name} - ${variant.name}` : sellable.name,
            sku: variant.sku,
            categoryName: sellable.categories.name,
            kind: isProduct ? "product" : "made_to_order",
            price: variant.base_price.toString(),
            customPrice: sellable.pricing_mode === "custom",
            unit: variant.units.code,
            onHand: isProduct
              ? variant.inventory_batches.reduce((sum, batch) => sum + batch.available_quantity, 0)
              : null,
            nextUnitCost: variant.inventory_batches[0]?.unit_cost.toString() ?? null,
          };
        }),
      );
    });
  },
});
