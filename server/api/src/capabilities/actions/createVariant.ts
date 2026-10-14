import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";
import { recordOpeningStock } from "../stocks/openingStock";

export interface CreateVariantInput {
  sellableId: string;
  name: string;
  sku?: string;
  basePrice: number;
  /** Starting stock, recorded as a real opening-stock batch - omit or 0 for no starting stock. */
  openingQuantity?: number;
  /** Required alongside openingQuantity - what that starting stock cost. */
  openingUnitCost?: number;
}

/** Adds one variant under an existing product. Returns the whole product - see listProducts/createProduct for why there's no stored price/quantity roll-up to recompute. */
export const createVariant = defineCapability<CreateVariantInput, ProductDto>({
  name: "createVariant",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
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

        const row = await tx.sellables.findUniqueOrThrow({
          where: { id: input.sellableId },
          select: PRODUCT_SELECT,
        });
        return toProductDto(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("That SKU is already used by another product.");
      }
      throw error;
    }
  },
});
