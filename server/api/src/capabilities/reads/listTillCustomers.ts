import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { CUSTOMER_SELECT, toCustomerDto, type CustomerDto } from "../customers/dto";
import { customerBalances } from "../customers/ledger";
import { customerSpends } from "../customers/spend";

/**
 * The till's customer picker - active customers only, under "pos:view" so a
 * cashier without access to the Customers screen can still attach one to a sale.
 */
export const listTillCustomers = defineCapability<void, CustomerDto[]>({
  name: "listTillCustomers",
  kind: "read",
  description:
    "Active customers by name, as the till's customer picker shows them, each with balance (above 0 they owe the shop, below 0 they hold store credit). Archived customers are left out. Same data as listCustomers for people with POS access but not the Customers screen. Amounts are decimal text in rupees. Takes no input.",
  input: z.void(),
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
      const spends = await customerSpends(
        tx,
        actor.tenantId,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toCustomerDto(row, balances.get(row.id) ?? 0, spends.get(row.id)));
    });
  },
});
