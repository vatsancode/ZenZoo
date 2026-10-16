import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { SaleDto } from "../sales/dto";
import { recordReturn, type RecordReturnInput } from "../sales/recordReturn";
import { findSale } from "../sales/recordSale";

export type CreateSaleReturnInput = RecordReturnInput;

/**
 * Takes goods back from a customer and makes them whole - see recordReturn. Resolves to the sale
 * as it is now, with the new return on it. Sending the same return id twice (a double-click, a
 * retry after a dropped connection) never takes the goods back twice.
 */
export const createSaleReturn = defineCapability<CreateSaleReturnInput, SaleDto>({
  name: "createSaleReturn",
  kind: "action",
  requiredPermission: "sales:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    try {
      return await runInTenantContext(actor, (tx) => recordReturn(tx, actor, input));
    } catch (error) {
      // Two copies of the same return arrived at once: the first committed while the second was
      // still checking. The second hits the id's unique index - give it the sale as it now is.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const saved = await runInTenantContext(actor, (tx) =>
          findSale(tx, actor, input.storeId, input.saleId),
        );
        if (saved) return saved;
      }
      throw error;
    }
  },
});
