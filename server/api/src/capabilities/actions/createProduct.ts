import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { PRODUCT_SELECT, toProductDto, type ProductDto } from "../products/dto";
import { recordOpeningStock } from "../stocks/openingStock";

export interface CreateProductVariantInput {
  name: string;
  sku?: string;
  basePrice: number;
  unitId: string;
  /** Starting stock, recorded as a real opening-stock batch - omit or 0 for no starting stock. */
  openingQuantity?: number;
  /** Required alongside openingQuantity - what that starting stock cost. */
  openingUnitCost?: number;
}

export interface CreateProductInput {
  storeId: string;
  name: string;
  categoryId: string;
  /** When any variant carries opening stock - defaults to today if omitted. */
  openingStockDate?: string;
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
      if (variant.openingQuantity) {
        if (variant.openingQuantity < 0) throw new Error("Opening stock can't be negative.");
        if (variant.openingUnitCost == null || variant.openingUnitCost < 0) {
          throw new Error("Give the opening stock a cost per unit.");
        }
      }
    }
    const openingStockDate = input.openingStockDate ?? new Date().toISOString().slice(0, 10);

    try {
      return await runInTenantContext(actor, async (tx) => {
        const category = await tx.categories.findFirst({
          where: { id: input.categoryId, tenant_id: actor.tenantId, store_id: input.storeId },
          select: { id: true },
        });
        if (!category) throw new Error("That category doesn't exist.");

        const unitIds = [...new Set(input.variants.map((variant) => variant.unitId))];
        const units = await tx.units.findMany({
          where: { id: { in: unitIds }, tenant_id: actor.tenantId, status: "active" },
          select: { id: true },
        });
        if (units.length !== unitIds.length) throw new Error("Choose a unit for every variant.");

        // "Keep importing all new inventory items" - see setCatalogueAutoImport.
        const store = await tx.stores.findFirstOrThrow({
          where: { id: input.storeId, tenant_id: actor.tenantId },
          select: { catalogue_auto_import: true },
        });

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
            category_id: input.categoryId,
            is_sellable: store.catalogue_auto_import,
          },
          select: { id: true },
        });

        // One create per line, not createMany - a variant carrying opening
        // stock needs its own real id straight away, to record that stock
        // against, and createMany doesn't hand back the rows it just made.
        for (const variant of input.variants) {
          const created = await tx.variants.create({
            data: {
              tenant_id: actor.tenantId,
              store_id: input.storeId,
              sellable_id: sellable.id,
              name: variant.name.trim(),
              sku: variant.sku?.trim() || null,
              base_price: variant.basePrice,
              unit_id: variant.unitId,
            },
            select: { id: true },
          });

          if (variant.openingQuantity) {
            await recordOpeningStock(tx, actor, {
              storeId: input.storeId,
              variantId: created.id,
              quantity: variant.openingQuantity,
              unitCost: variant.openingUnitCost!,
              date: openingStockDate,
            });
          }
        }

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
