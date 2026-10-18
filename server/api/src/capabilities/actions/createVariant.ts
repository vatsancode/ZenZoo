import { defineCapability } from "../capability";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";
import { addVariant, type AddVariantInput } from "../products/addVariant";

export type CreateVariantInput = AddVariantInput;

/** Adds one variant under an existing product. Returns the whole product - see listProducts/createProduct for why there's no stored price/quantity roll-up to recompute. */
export const createVariant = defineCapability<CreateVariantInput, ProductDto>({
  name: "createVariant",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
    return addVariant(actor, input, async (tx, sellableId) => {
      const row = await tx.sellables.findUniqueOrThrow({
        where: { id: sellableId },
        select: PRODUCT_SELECT,
      });
      return toProductDto(row);
    });
  },
});
