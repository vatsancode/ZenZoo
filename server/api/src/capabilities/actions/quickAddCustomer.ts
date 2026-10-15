import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import {
  assertPhoneFree,
  cleanCustomerInput,
  CUSTOMER_SELECT,
  rethrowPhoneTaken,
  toCustomerDto,
  type CustomerDto,
} from "../customers/dto";

export interface QuickAddCustomerInput {
  name: string;
  phone?: string;
}

/**
 * Adding a customer at the counter - name and phone only, under "pos:edit"
 * so any cashier can do it without access to the Customers screen. The full
 * profile (email, address, notes) is filled in later from there.
 */
export const quickAddCustomer = defineCapability<QuickAddCustomerInput, CustomerDto>({
  name: "quickAddCustomer",
  kind: "action",
  requiredPermission: "pos:edit",
  async handler(actor, input) {
    const fields = cleanCustomerInput({ name: input.name, phone: input.phone });

    try {
      return await runInTenantContext(actor, async (tx) => {
        await assertPhoneFree(tx, actor, fields.phone);
        const created = await tx.customers.create({
          data: { tenant_id: actor.tenantId, name: fields.name, phone: fields.phone },
          select: CUSTOMER_SELECT,
        });
        return toCustomerDto(created);
      });
    } catch (error) {
      rethrowPhoneTaken(error);
    }
  },
});
