import type { Prisma } from "@prisma/client";
import { defineCapability } from "../capability";
import { runInTenantContext } from "../../shared/tenantContext";
import { assertStoreAccess } from "../../shared/storeAccess";
import { LEDGER_SELECT, describeLedgerRows, isLedgerKind, type LedgerPageDto } from "../ledger/dto";

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
  if (Number.isNaN(date.getTime())) throw new Error(`The ${what} date isn't a real date.`);
  return date;
}

/** Every money in and out of the store's accounts, newest first, read-only by design. */
export const listAccountLedger = defineCapability<ListAccountLedgerInput, LedgerPageDto>({
  name: "listAccountLedger",
  kind: "read",
  requiredPermission: "accounts:view",
  async handler(actor, input) {
    await assertStoreAccess(actor, input.storeId);

    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(input.pageSize) || 25)));
    if (input.kind && !isLedgerKind(input.kind))
      throw new Error("That isn't a kind of transaction.");
    if (input.direction && input.direction !== "in" && input.direction !== "out") {
      throw new Error("Choose money in or money out.");
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
