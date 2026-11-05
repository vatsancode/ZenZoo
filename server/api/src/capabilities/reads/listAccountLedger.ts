import { UserFacingError } from "../../shared/errors";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import {
  LEDGER_KINDS,
  LEDGER_SELECT,
  describeLedgerRows,
  isLedgerKind,
  type LedgerPageDto,
} from "../ledger/dto";

export interface ListAccountLedgerInput {
  storeId: string;
  /** One account, or every account in the store when left out. */
  accountId?: string;
  direction?: "in" | "out";
  kind?: string;
  /** ISO date-times; the screen turns its chosen days into the shop's own midnight. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

const MAX_PAGE_SIZE = 100;

function dateOrNull(value: string | undefined, what: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new UserFacingError(`The ${what} date isn't a real date.`);
  return date;
}

/** Every money in and out of the store's accounts, newest first, read-only by design. */
export const listAccountLedger = defineCapability<ListAccountLedgerInput, LedgerPageDto>({
  name: "listAccountLedger",
  kind: "read",
  description:
    "Every money movement in and out of a store's accounts, newest first, one page at a time. Each row has its time, account, kind (such as sale_payment, expense_payment or transfer_in), amount (positive is money in, negative is money out), the balance afterwards, a plain description and who did it. The reply also gives the total number of matching rows and the sums of money in and money out across all pages. Filter by account, direction, kind or a date range (ISO date-times, such as 2026-11-01T00:00:00+05:30). pageSize is at most 100. Get storeId from listStores and accountId from listAccounts. Amounts are decimal text in rupees.",
  input: z.object({
    storeId: z.string().describe("The store's id, from listStores."),
    accountId: z.string().optional().describe("Only this account; every account when left out."),
    direction: z
      .enum(["in", "out"])
      .optional()
      .describe("Only money coming in, or only money going out."),
    kind: z.enum(LEDGER_KINDS).optional().describe("Only this kind of movement."),
    from: z.string().optional().describe("From this ISO date-time (included)."),
    to: z.string().optional().describe("Up to this ISO date-time (not included)."),
    page: z.number().int().min(1).optional().describe("Page number, starting at 1."),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Rows per page, at most 100 (25 by default)."),
  }),
  requiredPermission: "accounts:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(input.pageSize) || 25)));
    if (input.kind && !isLedgerKind(input.kind))
      throw new UserFacingError("That isn't a kind of transaction.");
    if (input.direction && input.direction !== "in" && input.direction !== "out") {
      throw new UserFacingError("Choose money in or money out.");
    }
    const from = dateOrNull(input.from, "start");
    const to = dateOrNull(input.to, "end");

    const where: Prisma.account_ledgerWhereInput = {
      tenant_id: actor.tenantId,
      store_id: input.storeId,
      ...(input.accountId ? { account_id: input.accountId } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.direction ? { amount: input.direction === "in" ? { gt: 0 } : { lt: 0 } } : {}),
      ...(from || to
        ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
    };

    return runInTenantContext(actor, async (tx) => {
      const [rows, total, moneyIn, moneyOut, accounts] = await Promise.all([
        tx.account_ledger.findMany({
          where,
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: LEDGER_SELECT,
        }),
        tx.account_ledger.count({ where }),
        tx.account_ledger.aggregate({
          where: { AND: [where, { amount: { gt: 0 } }] },
          _sum: { amount: true },
        }),
        tx.account_ledger.aggregate({
          where: { AND: [where, { amount: { lt: 0 } }] },
          _sum: { amount: true },
        }),
        tx.payment_accounts.findMany({
          where: { tenant_id: actor.tenantId, store_id: input.storeId },
          select: { id: true, name: true },
        }),
      ]);

      const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
      return {
        rows: await describeLedgerRows(tx, actor.tenantId, rows, accountNames),
        total,
        moneyIn: (moneyIn._sum.amount ?? 0).toString(),
        // Shown as a positive "out" figure; the rows themselves keep their sign.
        moneyOut: (moneyOut._sum.amount ?? 0).toString().replace(/^-/, ""),
      };
    });
  },
});
