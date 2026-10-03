import { PrismaClient } from "@prisma/client";

/**
 * One PrismaClient per process, reused across modules/capabilities rather
 * than instantiated per-request. In dev, stash it on `globalThis` so a
 * file-watcher reload (tsx watch) doesn't open a fresh pool of connections
 * on every save.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
