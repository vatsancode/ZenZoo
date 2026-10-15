import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import {
  assertPhoneFree,
  cleanCustomerInput,
  CUSTOMER_SELECT,
  rethrowPhoneTaken,
  toCustomerDto,
  type CustomerDto,
  type CustomerInput,
} from "../customers/dto";
import { customerBalance } from "../customers/ledger";

export interface UpdateCustomerInput extends CustomerInput {
  id: string;
}

/** Edits the profile. Past sales point at the customer by id, so they follow the new name. */
export const updateCustomer = defineCapability<UpdateCustomerInput, CustomerDto>({
  name: "updateCustomer",
  kind: "action",
  requiredPermission: "customers:edit",
  async handler(actor, input) {
    const fields = cleanCustomerInput(input);

    try {
      return await runInTenantContext(actor, async (tx) => {
        const existing = await tx.customers.findFirst({
          where: { id: input.id, tenant_id: actor.tenantId },
          select: { status: true },
        });
        if (!existing) throw new Error("That customer doesn't exist.");
        // An archived customer's phone isn't held, so only check when they're active.
        if (existing.status === "active") await assertPhoneFree(tx, actor, fields.phone, input.id);

        const updated = await tx.customers.update({
          where: { id: input.id },
          data: fields,
          select: CUSTOMER_SELECT,
        });
        return toCustomerDto(updated, await customerBalance(tx, actor.tenantId, updated.id));
      });
    } catch (error) {
      rethrowPhoneTaken(error);
    }
  },
});
