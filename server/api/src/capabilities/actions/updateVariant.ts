import { UserFacingError } from "../../shared/errors";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";
import { GENERATED_SKU_ATTEMPTS, generateSku, isSkuClash } from "../products/sku";

export interface UpdateVariantInput {
  id: string;
  name: string;
  sku?: string;
  basePrice: number;
}

/**
 * Edits one variant's name/SKU/price. Status is a separate capability - see
 * setVariantStatus. Unit isn't editable here at all - every variant under a
 * product shares one, changed for all of them at once by setProductUnit.
 */
export const updateVariant = defineCapability<UpdateVariantInput, ProductDto>({
  name: "updateVariant",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new UserFacingError("Give the variant a name.");
    if (input.basePrice < 0) throw new UserFacingError("Price can't be negative.");

    // A variant never ends up without a SKU: clearing it (or editing an older variant that
    // never had one) generates one, the same way creating does.
    const generatesSku = !input.sku?.trim();

    for (let attempt = 1; ; attempt++) {
      try {
        return await runInTenantContext(actor, async (tx) => {
          const existing = await tx.variants.findFirst({
            where: { id: input.id, tenant_id: actor.tenantId },
            select: { store_id: true, sellable_id: true, sellables: { select: { name: true } } },
          });
          if (!existing) throw new UserFacingError("That variant doesn't exist.");
          await assertStoreAccess(actor, existing.store_id);

          await tx.variants.update({
            where: { id: input.id },
            data: {
              name,
              sku:
                input.sku?.trim() ||
                (await generateSku(tx, actor.tenantId, existing.sellables.name, name)),
              base_price: input.basePrice,
            },
          });

          const row = await tx.sellables.findUniqueOrThrow({
            where: { id: existing.sellable_id },
            select: PRODUCT_SELECT,
          });
          return toProductDto(row);
        });
      } catch (error) {
        if (isSkuClash(error)) {
          if (generatesSku && attempt < GENERATED_SKU_ATTEMPTS) continue;
          throw new UserFacingError("That SKU is already used by another product.");
        }
        throw error;
      }
    }
  },
});
