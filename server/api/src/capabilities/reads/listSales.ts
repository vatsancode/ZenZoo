import type { CapabilityActor } from "@zenzoo/types";
import { defineCapability } from "../capability";
import { runInTenantContext, type TenantTx } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { SALE_SELECT, toSaleDto, type SaleDto } from "../sales/dto";

export interface ListSalesInput {
  storeId: string;
  /** Sold on or after this date (YYYY-MM-DD, the shop's day). */
  from?: string;
  /** Sold on or before this date (YYYY-MM-DD). */
  to?: string;
  customerId?: string;
  /** Cancelled sales too - for the Sales list, which shows them struck out. Everything else leaves them out. */
  includeVoided?: boolean;
  /** Newest first, capped - default 1000, at most 5000. */
  limit?: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

/** The list's query, against an open transaction (so it can be tested without committing). */
export async function listSalesInTx(
  tx: TenantTx,
  actor: CapabilityActor,
  input: ListSalesInput,
): Promise<SaleDto[]> {
  for (const [name, value] of [
    ["from", input.from],
    ["to", input.to],
  ] as const) {
    if (value !== undefined && !DAY.test(value))
      throw new Error(`"${name}" must be a date like 2026-10-15.`);
  }
  const limit = Math.min(Math.max(Math.floor(Number(input.limit) || DEFAULT_LIMIT), 1), MAX_LIMIT);

  const rows = await tx.sales.findMany({
    where: {
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      status: input.includeVoided ? { in: ["completed", "voided"] } : "completed",
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      ...(input.from || input.to
        ? {
            sold_at: {
              ...(input.from ? { gte: new Date(`${input.from}T00:00:00.000Z`) } : {}),
              // Up to the end of the "to" day.
              ...(input.to
                ? { lt: new Date(new Date(`${input.to}T00:00:00.000Z`).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
    },
    orderBy: [{ sold_at: "desc" }, { id: "desc" }],
    take: limit,
    select: SALE_SELECT,
  });
  return rows.map(toSaleDto);
}

export const listSales = defineCapability<ListSalesInput, SaleDto[]>({
  name: "listSales",
  kind: "read",
  requiredPermission: "sales:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => listSalesInTx(tx, actor, input));
  },
});
