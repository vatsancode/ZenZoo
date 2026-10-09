import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface UpdateVariantInput {
  id: string;
  name: string;
  sku?: string;
  basePrice: number;
  unit?: string;
}

/** Edits one variant's name/SKU/price/unit. Status is a separate capability - see setVariantStatus. */
export const updateVariant = defineCapability<UpdateVariantInput, ProductDto>({
  name: "updateVariant",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Give the variant a name.");
    if (input.basePrice < 0) throw new Error("Price can't be negative.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.variants.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { store_id: true, sellable_id: true },
        });
        if (!existing) throw new Error("That variant doesn't exist.");
        await assertStoreAccess(actor, existing.store_id);

        await tx.variants.update({
          where: { id: input.id },
          data: {
            name,
            sku: input.sku?.trim() || null,
            base_price: input.basePrice,
            unit: input.unit?.trim() || "pcs",
          },
        });

        const row = await tx.sellables.findUniqueOrThrow({
          where: { id: existing.sellable_id },
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
