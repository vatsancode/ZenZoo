import { defineCapability } from "../capability";
import {
  PURCHASABLE_PRODUCT_SELECT,
  toPurchasableProductDto,
  type PurchasableProductDto,
} from "../products/purchasableDto";
import { addVariant } from "../products/addVariant";

export interface CreatePurchaseVariantInput {
  sellableId: string;
  name: string;
  sku?: string;
  basePrice: number;
}

/**
 * "Add new variant" from inside a purchase - under "purchases:edit", so whoever is buying can
 * add a size or flavour of something they already stock without needing Stocks access.
 *
 * It runs the very same addVariant as createVariant (validation, inherited unit, SKU check), so
 * the rules live in one place; createVariant keeps its own "stocks:edit". The differences are
 * deliberate: no opening stock (putting stock on the shelves is a Stocks action - buying is what
 * the purchase itself records), and the answer is the purchase form's view of the product, not
 * the whole record. Brand-new products stay a Stocks action (createProduct).
 */
export const createPurchaseVariant = defineCapability<
  CreatePurchaseVariantInput,
  PurchasableProductDto
>({
  name: "createPurchaseVariant",
  kind: "action",
  requiredPermission: "purchases:edit",
  async handler(actor, input) {
    return addVariant(
      actor,
      {
        sellableId: input.sellableId,
        name: input.name,
        sku: input.sku,
        basePrice: input.basePrice,
      },
      async (tx, sellableId) => {
        const row = await tx.sellables.findUniqueOrThrow({
          where: { id: sellableId },
          select: PURCHASABLE_PRODUCT_SELECT,
        });
        return toPurchasableProductDto(row);
      },
    );
  },
});
