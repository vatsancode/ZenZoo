import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { CATALOGUE_SELECT, toCatalogueItemDto, type CatalogueItemDto } from "../catalogue/dto";
import {
  assertMadeToOrderWritable,
  cleanMadeToOrderInput,
  type MadeToOrderInput,
} from "../catalogue/madeToOrder";

export type CreateMadeToOrderItemInput = MadeToOrderInput;

/**
 * Adds something sold that isn't counted as stock - a service today, a cafe
 * recipe later. Stored like a product (a sellable plus one variant) because
 * sale_items always point at a variant, so the till needs no special case.
 * The variant's unit is the tenant's "pcs": a made-to-order item is always
 * sold one at a time, so the form never asks.
 */
export const createMadeToOrderItem = defineCapability<CreateMadeToOrderItemInput, CatalogueItemDto>(
  {
    name: "createMadeToOrderItem",
    kind: "action",
    requiredPermission: "catalogue:edit",
    async handler(actor, input) {
      await assertStoreAccess(actor, input.storeId);
      const fields = cleanMadeToOrderInput(input);

      return runInTenantContext(actor, async (tx) => {
        await assertMadeToOrderWritable(tx, actor, input.storeId, fields);

        const unit = await tx.units.findFirst({
          where: { tenant_id: actor.tenantId, code: "pcs" },
          select: { id: true },
        });
        if (!unit) throw new Error('The "pcs" unit is missing - add it in Settings > Units.');

        const sellable = await tx.sellables.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            name: fields.name,
            kind: "made_to_order",
            category_id: fields.categoryId,
            is_sellable: true,
            pricing_mode: fields.pricing,
          },
          select: { id: true },
        });
        await tx.variants.create({
          data: {
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            sellable_id: sellable.id,
            name: fields.name,
            base_price: fields.price,
            unit_id: unit.id,
          },
        });

        const row = await tx.sellables.findUniqueOrThrow({
          where: { id: sellable.id },
          select: CATALOGUE_SELECT,
        });
        return toCatalogueItemDto(row);
      });
    },
  },
);
