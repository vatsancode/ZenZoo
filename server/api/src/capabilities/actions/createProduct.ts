import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";

export interface CreateProductVariantInput {
  name: string;
  sku?: string;
  basePrice: number;
  unit?: string;
}

export interface CreateProductInput {
  storeId: string;
  name: string;
  categoryId?: string;
  /**
   * Always >= 1 - "every sellable needs at least one variant" is an
   * application rule, not DB-enforced (docs/db-design.md). A product with
   * the "has variants" toggle off is still exactly this shape: the caller
   * sends one variant, named to match the product, carrying the price/SKU
   * fields the simple form collected - this capability has no separate
   * "simple product" code path, only "a sellable with its variants."
   */
  variants: CreateProductVariantInput[];
}

export const createProduct = defineCapability<CreateProductInput, ProductDto>({
  name: "createProduct",
  kind: "action",
  requiredPermission: "stocks:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    const name = input.name.trim();
    if (!name) throw new Error("Give the product a name.");
    if (input.variants.length === 0) throw new Error("A product needs at least one variant.");
    for (const variant of input.variants) {
      if (!variant.name.trim()) throw new Error("Give every variant a name.");
      if (variant.basePrice < 0) throw new Error("Price can't be negative.");
    }

    try {
      return await runInTenantContext(actor, async (tx) => {
        if (input.categoryId) {
          const category = await tx.categories.findFirst({
            where: { id: input.categoryId, tenant_id: actor.tenantId, store_id: input.storeId },
            select: { id: true },
          });
          if (!category) throw new Error("That category doesn't exist.");
        }

        // Two steps, not a nested create - same reasoning as createRole:
        // variants' composite FK needs tenant_id/store_id populated
        // explicitly, which Prisma's nested-write shape can't infer from
        // the sellables relation alone.
        const sellable = await tx.sellables.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            name,
            kind: "product",
            category_id: input.categoryId ?? null,
          },
          select: { id: true },
        });
        await tx.variants.createMany({
          data: input.variants.map((variant) => ({
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            sellable_id: sellable.id,
            name: variant.name.trim(),
            sku: variant.sku?.trim() || null,
            base_price: variant.basePrice,
            unit: variant.unit?.trim() || "pcs",
          })),
        });

        const row = await tx.sellables.findUniqueOrThrow({
          where: { id: sellable.id },
          select: PRODUCT_SELECT,
        });
        return toProductDto(row);
      });
    } catch (error) {
      // idx_variants_tenant_sku_unique - SKU is unique tenant-wide, not just within this product
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("That SKU is already used by another product.");
      }
      throw error;
    }
  },
});
