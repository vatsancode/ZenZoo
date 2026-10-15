import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import {
  assertPhoneFree,
  CUSTOMER_SELECT,
  rethrowPhoneTaken,
  toCustomerDto,
  type CustomerDto,
} from "../customers/dto";
import { customerBalance } from "../customers/ledger";

export interface SetCustomerStatusInput {
  id: string;
  archived: boolean;
}

/**
 * Archive or restore - never a delete: sales and the credit ledger point at
 * customers, so the row has to stay. Archiving frees their phone number;
 * restoring needs it to still be free.
 */
export const setCustomerStatus = defineCapability<SetCustomerStatusInput, CustomerDto>({
  name: "setCustomerStatus",
  kind: "action",
  requiredPermission: "customers:delete",
  async handler(actor, input) {
    if (typeof input.archived !== "boolean") throw new Error("Say whether to archive or restore.");

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.customers.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { phone: true },
        });
        if (!existing) throw new Error("That customer doesn't exist.");
        if (!input.archived) await assertPhoneFree(tx, actor, existing.phone, input.id);

        const updated = await tx.customers.update({
          where: { id: input.id },
          data: { status: input.archived ? "archived" : "active" },
          select: CUSTOMER_SELECT,
        });
        return toCustomerDto(updated, await customerBalance(tx, actor.tenantId, updated.id));
      });
    } catch (error) {
      rethrowPhoneTaken(error);
    }
  },
});
