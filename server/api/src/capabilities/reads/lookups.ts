import { z } from "zod";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import type { CategoryDto } from "../categories/dto";
import type { UnitDto } from "../units/dto";
import { sortByPlacement } from "../../shared/placement";
import { categoriesInTx, unitsInTx } from "../lookups/queries";

/**
 * Lookups: the small lists a screen needs to fill a picker or name a record, available under the
 * screen's own area so a role doesn't need Settings, Vendors or Customers just to use them.
 *
 * Each returns only what a picker shows - an id, a name, and a status so a screen can still name
 * something that has since been switched off while offering only what is active. No balances,
 * contact details or counts. The full list reads (listAccounts, listSuppliers, ...) keep their own
 * permission and are untouched; these are additive. A lookup lists every area whose screens use
 * it ("any one of") - holding one of them grants this read and nothing else.
 */

const active = (status: string): "active" | "inactive" =>
  status === "active" ? "active" : "inactive";

export interface LookupStatus {
  status: "active" | "inactive";
}

export interface SupplierLookup extends LookupStatus {
  id: string;
  name: string;
}

/** Tenant-wide - suppliers has no store_id. */
export const lookupSuppliers = defineCapability<void, SupplierLookup[]>({
  name: "lookupSuppliers",
  kind: "read",
  description:
    "A short list of all suppliers: id, name and whether active or inactive, by name. Use it to find a supplier's id; for contact details and balances use listSuppliers. Takes no input.",
  input: z.void(),
  // Expenses (payee), Purchases (vendor), Stocks (who a batch was bought from).
  requiredPermission: ["expenses:view", "purchases:view", "stocks:view"],
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.suppliers.findMany({
        where: { tenant_id: actor.tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, status: true },
      });
      return rows.map((row) => ({ id: row.id, name: row.name, status: active(row.status) }));
    });
  },
});

export interface AccountLookup extends LookupStatus {
  id: string;
  name: string;
  code: string;
}

export interface LookupStoreInput {
  storeId: string;
}

const storeInput = z.object({
  storeId: z.string().describe("The store's id, from listStores."),
});

/** The store's accounts, without opening or running balances. */
export const lookupAccounts = defineCapability<LookupStoreInput, AccountLookup[]>({
  name: "lookupAccounts",
  kind: "read",
  description:
    "A short list of a store's payment accounts (such as cash drawer or bank): id, name, code and whether active or inactive. No balances; for those use listAccounts. Get storeId from listStores.",
  input: storeInput,
  // Expenses (pay from), Purchases (pay from, and naming past payments).
  requiredPermission: ["expenses:view", "purchases:view"],
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.payment_accounts.findMany({
        where: { tenant_id: actor.tenantId, store_id: input.storeId },
        orderBy: { created_at: "asc" },
        select: { id: true, name: true, code: true, status: true },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        status: active(row.status),
      }));
    });
  },
});

export interface PaymentMethodLookup extends LookupStatus {
  id: string;
  name: string;
  code: string;
}

/** Tenant-wide - payment_methods has no store_id. */
export const lookupPaymentMethods = defineCapability<void, PaymentMethodLookup[]>({
  name: "lookupPaymentMethods",
  kind: "read",
  description:
    "A short list of all payment methods (such as cash, UPI, card), including switched-off ones: id, name, code and whether active or inactive. Takes no input.",
  input: z.void(),
  // Purchases (pay with, and naming past payments).
  requiredPermission: "purchases:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.payment_methods.findMany({
        where: { tenant_id: actor.tenantId },
        select: { id: true, name: true, code: true, status: true, sort_order: true },
      });
      return sortByPlacement(rows).map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        status: active(row.status),
      }));
    });
  },
});

/** Units are already just a code, a name and whether they take decimals - same shape as listUnits. */
export const lookupUnits = defineCapability<void, UnitDto[]>({
  name: "lookupUnits",
  kind: "read",
  description:
    "Units of measure products are counted in (such as kg or piece), each with a code, a name and whether quantities may have decimals. Takes no input.",
  input: z.void(),
  // Stocks (product forms), Purchases (the "new product" sheet), Settings (the Units page).
  requiredPermission: ["stocks:view", "purchases:view", "settings:view"],
  async handler(actor) {
    return runInTenantContext(actor, (tx) => unitsInTx(tx, actor));
  },
});

/** Categories are already just an id, a name and a parent - same shape as listCategories. */
export const lookupCategories = defineCapability<LookupStoreInput, CategoryDto[]>({
  name: "lookupCategories",
  kind: "read",
  description:
    "Product categories for a store: id, name and parent category. Get storeId from listStores.",
  input: storeInput,
  // Stocks (product forms), Purchases (the "new product" sheet), Settings (the Categories page),
  // Catalogue (the category on a made-to-order item).
  requiredPermission: ["stocks:view", "purchases:view", "settings:view", "catalogue:view"],
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => categoriesInTx(tx, actor, input.storeId));
  },
});

export interface CustomerLookup extends LookupStatus {
  id: string;
  name: string;
  phone: string | null;
}

/** Tenant-wide. Name and phone only - no balance, email, address or notes. */
export const lookupCustomers = defineCapability<void, CustomerLookup[]>({
  name: "lookupCustomers",
  kind: "read",
  description:
    "A short list of all customers, including archived ones: id, name, phone and whether active or inactive. No balances or addresses; for those use listCustomers. Takes no input.",
  input: z.void(),
  // Sales (naming who a sale was for).
  requiredPermission: "sales:view",
  async handler(actor) {
    return runInTenantContext(actor, async (tx) => {
      const rows = await tx.customers.findMany({
        where: { tenant_id: actor.tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true, status: true },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        status: active(row.status),
      }));
    });
  },
});
