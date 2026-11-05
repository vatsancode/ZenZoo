import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { CUSTOMER_SELECT, toCustomerDto, type CustomerDto } from "../customers/dto";
import { customerBalances } from "../customers/ledger";
import { customerSpends } from "../customers/spend";

export interface ListCustomersInput {
  /** Archived customers are hidden unless asked for - the till never asks. */
  includeArchived?: boolean;
}

export const listCustomers = defineCapability<ListCustomersInput, CustomerDto[]>({
  name: "listCustomers",
  kind: "read",
  description:
    "All customers, by name, each with balance (above 0 they owe the shop, below 0 they hold store credit), number of purchases, total spent after refunds and last purchase date. Archived customers are left out unless includeArchived is true. Amounts are decimal text in rupees.",
  input: z.object({
    includeArchived: z.boolean().optional().describe("Include archived customers."),
  }),
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
      const spends = await customerSpends(
        tx,
        actor.tenantId,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toCustomerDto(row, balances.get(row.id) ?? 0, spends.get(row.id)));
    });
  },
});
