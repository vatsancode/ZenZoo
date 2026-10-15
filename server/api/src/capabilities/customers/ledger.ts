import { toPaise, type Paise } from "@zenzoo/pricing";
import type { TenantTx } from "../../shared/tenantContext";

/**
 * A customer's running balance, in paise: above zero they owe the shop, below zero they hold
 * store credit. Always a SUM of the append-only ledger, never a stored number - the same way
 * stock on hand is derived (docs/db-design.md).
 */
export async function customerBalance(
  tx: TenantTx,
  tenantId: string,
  customerId: string,
): Promise<Paise> {
  const sum = await tx.customer_credit_ledger.aggregate({
    where: { tenant_id: tenantId, customer_id: customerId },
    _sum: { amount: true },
  });
  return sum._sum.amount ? toPaise(sum._sum.amount.toString()) : 0;
}

/** Balances for many customers at once (customers with no entries are simply absent = 0). */
export async function customerBalances(
  tx: TenantTx,
  tenantId: string,
  customerIds: string[],
): Promise<Map<string, Paise>> {
  if (customerIds.length === 0) return new Map();
  const rows = await tx.customer_credit_ledger.groupBy({
    by: ["customer_id"],
    where: { tenant_id: tenantId, customer_id: { in: customerIds } },
    _sum: { amount: true },
  });
  return new Map(
    rows.map((row) => [row.customer_id, row._sum.amount ? toPaise(row._sum.amount.toString()) : 0]),
  );
}

/**
 * Makes everything that changes one customer's balance take turns (a sale put on their account,
 * a payment from them), so two tills can't both spend the same store credit. Held until the
 * transaction ends. The app's database role can't lock ledger rows itself, hence an advisory lock.
 */
export async function lockCustomer(tx: TenantTx, customerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer:${customerId}`}, 0))`;
}

/** The two customer-credit payment methods' codes. */
export const STORE_CREDIT_CODE = "STORE_CREDIT";
export const ON_ACCOUNT_CODE = "ON_ACCOUNT";

/**
 * The ids of the "Store credit" and "On account" payment methods, creating them if this tenant
 * doesn't have them yet (existing tenants got them from a migration; a tenant created since gets
 * them on first use). A method the shop has switched off in Settings comes back as null.
 */
export async function creditMethods(
  tx: TenantTx,
  tenantId: string,
): Promise<{ storeCredit: string | null; onAccount: string | null }> {
  await tx.$executeRaw`
    INSERT INTO payment_methods (tenant_id, name, code, is_customer_credit)
    VALUES (${tenantId}::uuid, 'Store credit', ${STORE_CREDIT_CODE}, true),
           (${tenantId}::uuid, 'On account', ${ON_ACCOUNT_CODE}, true)
    ON CONFLICT (tenant_id, code) DO NOTHING`;
  const methods = await tx.payment_methods.findMany({
    where: { tenant_id: tenantId, code: { in: [STORE_CREDIT_CODE, ON_ACCOUNT_CODE] } },
    select: { id: true, code: true, status: true },
  });
  const active = (code: string) => {
    const method = methods.find((candidate) => candidate.code === code);
    return method && method.status === "active" ? method.id : null;
  };
  return { storeCredit: active(STORE_CREDIT_CODE), onAccount: active(ON_ACCOUNT_CODE) };
}
