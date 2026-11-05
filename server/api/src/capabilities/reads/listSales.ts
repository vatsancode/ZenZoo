import type { CapabilityActor } from "@zenzoo/types";
import { z } from "zod";
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
  description:
    "List sales for one store, newest first, each with its lines, payments and returns. Get storeId from listStores. Dates are the shop's own days (YYYY-MM-DD): for today's sales pass today's date as both from and to. Money amounts are decimal text in rupees, such as \"250.00\". Cancelled sales are left out unless includeVoided is true. Returns at most 1000 sales unless limit is set (maximum 5000).",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
    from: z.string().optional().describe("Sold on or after this day, YYYY-MM-DD."),
    to: z.string().optional().describe("Sold on or before this day, YYYY-MM-DD."),
    customerId: z.string().optional().describe("Only this customer's sales."),
    includeVoided: z.boolean().optional().describe("Include cancelled sales."),
    limit: z.number().int().min(1).max(5000).optional().describe("How many sales at most."),
  }),
  requiredPermission: "sales:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);
    return runInTenantContext(actor, (tx) => listSalesInTx(tx, actor, input));
  },
});
