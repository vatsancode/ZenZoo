import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { CUSTOMER_SELECT, toCustomerDto, type CustomerDto } from "../customers/dto";
import { customerBalances } from "../customers/ledger";

export interface ListCustomersInput {
  /** Archived customers are hidden unless asked for - the till never asks. */
  includeArchived?: boolean;
}

export const listCustomers = defineCapability<ListCustomersInput, CustomerDto[]>({
  name: "listCustomers",
  kind: "read",
  requiredPermission: "customers:view",
  async handler(actor, input) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.customers.findMany({
        where: {
          tenant_id: actor.tenantId,
          ...(input?.includeArchived ? {} : { status: "active" }),
        },
        orderBy: { name: "asc" },
        select: CUSTOMER_SELECT,
      });
      const balances = await customerBalances(
        tx,
        actor.tenantId,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toCustomerDto(row, balances.get(row.id) ?? 0));
    });
  },
});
