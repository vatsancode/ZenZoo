import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { CUSTOMER_SELECT, toCustomerDto, type CustomerDto } from "../customers/dto";
import { customerBalances } from "../customers/ledger";

/**
 * The till's customer picker - active customers only, under "pos:view" so a
 * cashier without access to the Customers screen can still attach one to a sale.
 */
export const listTillCustomers = defineCapability<void, CustomerDto[]>({
  name: "listTillCustomers",
  kind: "read",
  requiredPermission: "pos:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.customers.findMany({
        where: { tenant_id: actor.tenantId, status: "active" },
        orderBy: { name: "asc" },
        select: CUSTOMER_SELECT,
      });
      // The balance lets the till offer store credit and show what someone already owes.
      const balances = await customerBalances(
        tx,
        actor.tenantId,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toCustomerDto(row, balances.get(row.id) ?? 0));
    });
  },
});
