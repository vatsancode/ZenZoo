import { prisma } from "./prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Runs `fn` inside a transaction with app.current_tenant_id/app.current_user_id
 * set for that transaction only (set_config's third argument, `true`, scopes
 * it to the transaction - see "Row-level security" in docs/db-design.md).
 * This is the piece prisma/README.md flags as "once that wiring is built" -
 * it wasn't, until this module. `prisma` is one pooled client shared across
 * every request, so these session variables can never be set globally -
 * every tenant-scoped read/write must go through this wrapper, or RLS
 * silently returns zero rows (the same cold-start shape "Bootstrapping"
 * describes for provision_new_account, just on every ordinary request too).
 */
export async function runInTenantContext<T>(
  actor: { tenantId: string; userId: string },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${actor.tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${actor.userId}, true)`;
    return fn(tx);
  });
}

export type TenantTx = Prisma.TransactionClient;
export type { PrismaClient };
