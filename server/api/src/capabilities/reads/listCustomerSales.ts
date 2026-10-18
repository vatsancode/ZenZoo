import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { toCustomerSaleDto, type CustomerSaleDto } from "../sales/customerSaleDto";
import { listSalesInTx } from "./listSales";

export interface ListCustomerSalesInput {
  storeId: string;
  /** One customer's sales; leave out for everyone's (the Customers list totals them). */
  customerId?: string;
}

/**
 * What the Customers screens need from sales - purchase history, spend, preferences, dues -
 * under "customers:view", so a role with Customers but not Sales still sees them. It runs the
 * same query as listSales and then drops what a customer's page has no use for (see
 * CustomerSaleDto): costs, accounts, who rang it up. listSales keeps "sales:view".
 */
export const listCustomerSales = defineCapability<ListCustomerSalesInput, CustomerSaleDto[]>({
  name: "listCustomerSales",
  kind: "read",
  requiredPermission: "customers:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, async (tx) => {
      const sales = await listSalesInTx(tx, actor, {
        storeId: input.storeId,
        customerId: input.customerId,
      });
      // A walk-in sale belongs to no customer, so it has no place on a customer's screen.
      return sales.filter((sale) => sale.customerId !== null).map(toCustomerSaleDto);
    });
  },
});
