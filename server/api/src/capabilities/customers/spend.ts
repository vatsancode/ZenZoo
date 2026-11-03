import { toPaise, type Paise } from "@zenzoo/pricing";
import type { TenantTx } from "../../shared/tenantContext";

/** What a customer has bought, across every store, after anything refunded or credited back. */
export interface CustomerSpend {
  purchases: number;
  /** Paise: what they paid for completed sales, minus completed returns' refunds. */
  spentPaise: Paise;
  /** When they last bought, as YYYY-MM-DD; null if they never have. */
  lastPurchase: string | null;
}

export const NO_SPEND: CustomerSpend = { purchases: 0, spentPaise: 0, lastPurchase: null };

/**
 * Spend for many customers at once (customers with no sales are simply absent = none). The one
 * place "how much has this customer spent" is worked out - the Customers screens, the AI and any
 * MCP tool all read it from here rather than adding up sales themselves.
 */
export async function customerSpends(
  tx: TenantTx,
  tenantId: string,
  customerIds: string[],
): Promise<Map<string, CustomerSpend>> {
  if (customerIds.length === 0) return new Map();
  const [sales, returns] = await Promise.all([
    tx.sales.groupBy({
      by: ["customer_id"],
      where: { tenant_id: tenantId, customer_id: { in: customerIds }, status: "completed" },
      _count: { _all: true },
      _sum: { total_amount: true },
      _max: { sold_at: true },
    }),
    tx.sale_returns.findMany({
      where: {
        tenant_id: tenantId,
        status: "completed",
        sales: { customer_id: { in: customerIds }, status: "completed" },
      },
      select: { refund_amount: true, sales: { select: { customer_id: true } } },
    }),
  ]);

  const refunded = new Map<string, Paise>();
  for (const ret of returns) {
    const customerId = ret.sales.customer_id;
    if (!customerId) continue;
    refunded.set(
      customerId,
      (refunded.get(customerId) ?? 0) + toPaise(ret.refund_amount.toString()),
    );
  }

  const spends = new Map<string, CustomerSpend>();
  for (const row of sales) {
    if (!row.customer_id) continue;
    const total = row._sum.total_amount ? toPaise(row._sum.total_amount.toString()) : 0;
    spends.set(row.customer_id, {
      purchases: row._count._all,
      spentPaise: total - (refunded.get(row.customer_id) ?? 0),
      lastPurchase: row._max.sold_at ? row._max.sold_at.toISOString().slice(0, 10) : null,
    });
  }
  return spends;
}

export async function customerSpend(
  tx: TenantTx,
  tenantId: string,
  customerId: string,
): Promise<CustomerSpend> {
  return (await customerSpends(tx, tenantId, [customerId])).get(customerId) ?? NO_SPEND;
}
