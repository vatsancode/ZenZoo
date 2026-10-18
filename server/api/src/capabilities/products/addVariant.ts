import { Prisma } from "@prisma/client";
import type { CapabilityActor } from "@zenzoo/types";
import { runInTenantContext, type TenantTx } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { recordOpeningStock } from "../stocks/openingStock";

export interface AddVariantInput {
  sellableId: string;
  name: string;
  sku?: string;
  basePrice: number;
  /** Starting stock, recorded as a real opening-stock batch - omit or 0 for no starting stock. */
  openingQuantity?: number;
  /** Required alongside openingQuantity - what that starting stock cost. */
  openingUnitCost?: number;
}

/**
 * Adds one variant under an existing product - the single place the rules for that live
 * (validation, the unit inherited from a sibling, the SKU check, opening stock), so the Stocks
 * action and the Purchases one can't drift apart. Which permission lets a caller in is the
 * caller's capability's business; this only does the work.
 *
 * `project` shapes what comes back, inside the same transaction, so each caller returns its own
 * view of the product (everything for Stocks, only what the purchase form shows for Purchases).
 */
export async function addVariant<T>(
  actor: CapabilityActor,
  input: AddVariantInput,
  project: (tx: TenantTx, sellableId: string) => Promise<T>,
): Promise<T> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the variant a name.");
  if (input.basePrice < 0) throw new Error("Price can't be negative.");
  if (input.openingQuantity) {
    if (input.openingQuantity < 0) throw new Error("Opening stock can't be negative.");
    if (input.openingUnitCost == null || input.openingUnitCost < 0) {
      throw new Error("Give the opening stock a cost per unit.");
    }
  }

  try {
    return await runInTenantContext(actor, async (tx) => {
      const sellable = await tx.sellables.findFirst({
        where: { id: input.sellableId, tenant_id: actor.tenantId },
        select: { store_id: true },
      });
      if (!sellable) throw new Error("That product doesn't exist.");
      await assertStoreAccess(actor, sellable.store_id);

      // Every variant under a product shares one unit - a new variant
      // inherits it from a sibling rather than being asked, same as
      // createProduct's own "a sellable with its variants" shape. Every
      // product always has >=1 variant by the time one can be added here.
      const sibling = await tx.variants.findFirst({
        where: { sellable_id: input.sellableId, tenant_id: actor.tenantId },
        select: { unit_id: true },
      });
      if (!sibling) throw new Error("That product doesn't exist.");

      const created = await tx.variants.create({
        data: {
          tenant_id: actor.tenantId,
          store_id: sellable.store_id,
          sellable_id: input.sellableId,
          name,
          sku: input.sku?.trim() || null,
          base_price: input.basePrice,
          unit_id: sibling.unit_id,
        },
        select: { id: true },
      });

      if (input.openingQuantity) {
        await recordOpeningStock(tx, actor, {
          storeId: sellable.store_id,
          variantId: created.id,
          quantity: input.openingQuantity,
          unitCost: input.openingUnitCost!,
          date: new Date().toISOString().slice(0, 10),
        });
      }

      return project(tx, input.sellableId);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("That SKU is already used by another product.");
    }
    throw error;
  }
}
