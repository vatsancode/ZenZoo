import type { Capability } from "./capability";
import { getCatalogueSettings } from "./reads/getCatalogueSettings";
import { getCustomer } from "./reads/getCustomer";
import { getDashboard } from "./reads/getDashboard";
import { getSale } from "./reads/getSale";
import { getSupplier } from "./reads/getSupplier";
import { listAccountLedger } from "./reads/listAccountLedger";
import { listAccounts } from "./reads/listAccounts";
import { listCatalogue } from "./reads/listCatalogue";
import { listCatalogueCandidates } from "./reads/listCatalogueCandidates";
import { listCategories } from "./reads/listCategories";
import { listCurrentStock } from "./reads/listCurrentStock";
import { listCustomerPayments } from "./reads/listCustomerPayments";
import { listCustomerSales } from "./reads/listCustomerSales";
import { listCustomerStatement } from "./reads/listCustomerStatement";
import { listCustomers } from "./reads/listCustomers";
import { listExpenseCategories } from "./reads/listExpenseCategories";
import { listExpenses } from "./reads/listExpenses";
import { listInventoryBatches } from "./reads/listInventoryBatches";
import { listPaymentMethods } from "./reads/listPaymentMethods";
import { listProducts } from "./reads/listProducts";
import { listPurchasePayments } from "./reads/listPurchasePayments";
import { listPurchases } from "./reads/listPurchases";
import { listSales } from "./reads/listSales";
import { listStockMovements } from "./reads/listStockMovements";
import { listStores } from "./reads/listStores";
import { listSuppliers } from "./reads/listSuppliers";
import { listTillCustomers } from "./reads/listTillCustomers";
import { listTillItems } from "./reads/listTillItems";
import {
  listCustomerPaymentOptions,
  listSaleRefundOptions,
  listTillPaymentOptions,
} from "./reads/listTillPaymentOptions";
import { listTransfers } from "./reads/listTransfers";
import { listUnits } from "./reads/listUnits";
import { lookupPurchasableProducts } from "./reads/lookupPurchasableProducts";
import {
  lookupAccounts,
  lookupCategories,
  lookupCustomers,
  lookupPaymentMethods,
  lookupSuppliers,
  lookupUnits,
} from "./reads/lookups";
import { previewSale } from "./reads/previewSale";

/**
 * Every read capability an outside tool (the MCP server) may be offered. Reads only, on purpose:
 * actions are not listed here, so nothing that loops over this list can reach one.
 *
 * Left out deliberately: listRoles and listUsers (who can do what is not for an agent to see).
 * Adding a read here is not enough on its own - the MCP server also skips any entry that has no
 * `description` and `input` yet.
 */

/** Groups tools so the MCP server can offer only the areas a caller needs, not every tool. */
export type CapabilityArea =
  | "catalogue"
  | "products"
  | "stock"
  | "sales"
  | "customers"
  | "suppliers"
  | "finance"
  | "dashboard"
  | "stores";

// Capabilities differ in Input/Output, so the list can't share one concrete type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyReadCapability = Capability<any, any>;

export interface RegistryEntry {
  area: CapabilityArea;
  capability: AnyReadCapability;
}

const entry = (area: CapabilityArea, capability: AnyReadCapability): RegistryEntry => ({
  area,
  capability,
});

export const capabilityRegistry: readonly RegistryEntry[] = [
  entry("catalogue", getCatalogueSettings),
  entry("catalogue", listCatalogue),
  entry("catalogue", listCatalogueCandidates),
  entry("catalogue", lookupPurchasableProducts),

  entry("products", listProducts),
  entry("products", listCategories),
  entry("products", listUnits),
  entry("products", lookupCategories),
  entry("products", lookupUnits),

  entry("stock", listCurrentStock),
  entry("stock", listInventoryBatches),
  entry("stock", listStockMovements),
  entry("stock", listTransfers),

  entry("sales", getSale),
  entry("sales", listSales),
  entry("sales", previewSale),
  entry("sales", listTillItems),
  entry("sales", listTillCustomers),
  entry("sales", listTillPaymentOptions),
  entry("sales", listCustomerPaymentOptions),
  entry("sales", listSaleRefundOptions),

  entry("customers", getCustomer),
  entry("customers", listCustomers),
  entry("customers", listCustomerSales),
  entry("customers", listCustomerPayments),
  entry("customers", listCustomerStatement),
  entry("customers", lookupCustomers),

  entry("suppliers", getSupplier),
  entry("suppliers", listSuppliers),
  entry("suppliers", lookupSuppliers),
  entry("suppliers", listPurchases),
  entry("suppliers", listPurchasePayments),

  entry("finance", listAccounts),
  entry("finance", listAccountLedger),
  entry("finance", listExpenses),
  entry("finance", listExpenseCategories),
  entry("finance", listPaymentMethods),
  entry("finance", lookupAccounts),
  entry("finance", lookupPaymentMethods),

  entry("dashboard", getDashboard),

  entry("stores", listStores),
];
