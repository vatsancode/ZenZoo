import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { CUSTOMER_SELECT, toCustomerDto, type CustomerDto } from "../customers/dto";
import { customerBalance } from "../customers/ledger";

export interface GetCustomerInput {
  id: string;
}

/** Archived customers are still returned - their profile and past sales stay viewable. */
export const getCustomer = defineCapability<GetCustomerInput, CustomerDto>({
  name: "getCustomer",
  kind: "read",
  requiredPermission: "customers:view",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const row = await tx.customers.findFirst({
        where: { id: input.id, tenant_id: actor.tenantId },
        select: CUSTOMER_SELECT,
      });
      if (!row) throw new Error("That customer doesn't exist.");
      return toCustomerDto(row, await customerBalance(tx, actor.tenantId, row.id));
    });
  },
});
