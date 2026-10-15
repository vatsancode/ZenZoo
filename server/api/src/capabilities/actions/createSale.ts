import { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { SaleDto } from "../sales/dto";
import { findSale, recordSale, type RecordSaleInput } from "../sales/recordSale";

export type CreateSaleInput = RecordSaleInput;

/**
 * Saves a real sale from the admin till. The till supplies the sale's own id, so sending the
 * same sale twice (a double-click, a retry after a dropped connection) returns the sale already
 * saved instead of charging twice. The work itself is recordSale - see there for the steps.
 */
export const createSale = defineCapability<CreateSaleInput, SaleDto>({
  name: "createSale",
  kind: "action",
  requiredPermission: "pos:edit",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    try {
      return await runInTenantContext(actor, (tx) => recordSale(tx, actor, input));
    } catch (error) {
      // Two copies of the same sale arrived at once: the first committed while the second was
      // still checking. The second hits the id's unique index - give it the saved sale.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const saved = await runInTenantContext(actor, (tx) =>
          findSale(tx, actor, input.storeId, input.id),
        );
        if (saved) return saved;
      }
      throw error;
    }
  },
});
