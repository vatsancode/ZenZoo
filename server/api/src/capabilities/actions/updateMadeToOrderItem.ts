import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { CATALOGUE_SELECT, toCatalogueItemDto, type CatalogueItemDto } from "../catalogue/dto";
import {
  assertMadeToOrderWritable,
  cleanMadeToOrderInput,
  type MadeToOrderInput,
} from "../catalogue/madeToOrder";

export interface UpdateMadeToOrderItemInput extends MadeToOrderInput {
  id: string;
}

/** Edits a made-to-order item's name, category and pricing. Its one variant follows along. */
export const updateMadeToOrderItem = defineCapability<UpdateMadeToOrderItemInput, CatalogueItemDto>(
  {
    name: "updateMadeToOrderItem",
    kind: "action",
    requiredPermission: "catalogue:edit",
    async handler(actor, input) {
      await assertStoreAccess(actor, input.storeId);
      const fields = cleanMadeToOrderInput(input);

      return runInTenantContext(actor, async (tx) => {
        const existing = await tx.sellables.findFirst({
          where: {
            id: input.id,
            tenant_id: actor.tenantId,
            store_id: input.storeId,
            kind: "made_to_order",
            status: "active",
          },
          select: { id: true },
        });
        if (!existing) throw new Error("That item doesn't exist.");
        await assertMadeToOrderWritable(tx, actor, input.storeId, fields, input.id);

        await tx.sellables.update({
          where: { id: input.id },
          data: { name: fields.name, category_id: fields.categoryId, pricing_mode: fields.pricing },
        });
        await tx.variants.updateMany({
          where: { sellable_id: input.id, tenant_id: actor.tenantId },
          data: { name: fields.name, base_price: fields.price },
        });

        const row = await tx.sellables.findUniqueOrThrow({
          where: { id: input.id },
          select: CATALOGUE_SELECT,
        });
        return toCatalogueItemDto(row);
      });
    },
  },
);
