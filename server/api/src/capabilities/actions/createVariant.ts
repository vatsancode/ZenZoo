import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface CreateVariantInput {
  sellableId: string;
  name: string;
  sku?: string;
  basePrice: number;
  unit?: string;
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

    try {
      return await runInTenantContext(actor, async (tx) => {
        const sellable = await tx.sellables.findFirst({
          where: { id: input.sellableId, tenant_id: actor.tenantId },
          select: { store_id: true },
        });
        if (!sellable) throw new Error("That product doesn't exist.");
        await assertStoreAccess(actor, sellable.store_id);

        await tx.variants.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: sellable.store_id,
            sellable_id: input.sellableId,
            name,
            sku: input.sku?.trim() || null,
            base_price: input.basePrice,
            unit: input.unit?.trim() || "pcs",
          },
        });

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
