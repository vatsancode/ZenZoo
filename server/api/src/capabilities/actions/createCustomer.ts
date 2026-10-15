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

export type CreateCustomerInput = CustomerInput;

/** The full form, from the Customers screen. The till uses quickAddCustomer instead. */
export const createCustomer = defineCapability<CreateCustomerInput, CustomerDto>({
  name: "createCustomer",
  kind: "action",
  requiredPermission: "customers:edit",
  async handler(actor, input) {
    const fields = cleanCustomerInput(input);

    try {
      return await runInTenantContext(actor, async (tx) => {
        await assertPhoneFree(tx, actor, fields.phone);
        const created = await tx.customers.create({
          data: { tenant_id: actor.tenantId, ...fields },
          select: CUSTOMER_SELECT,
        });
        return toCustomerDto(created);
      });
    } catch (error) {
      rethrowPhoneTaken(error);
    }
  },
});
