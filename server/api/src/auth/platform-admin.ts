import type { NextFunction, Request, Response } from "express";
import { prisma } from "../shared/prisma";
import { verifyPassword } from "../shared/password";

// A fixed dummy hash to compare against when no admin matches, so a lookup
// miss takes the same bcrypt-compare time as a real one - otherwise an
// unknown email returns near-instantly while a real one takes the full
// hashing time, letting a caller enumerate valid admin emails by timing.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Y.Ks5xjv1qhOqUi1dZTjzFl9nqBJS";

async function verifyPlatformAdmin(email: string, password: string): Promise<boolean> {
  const admin = await prisma.platform_admins.findUnique({
    where: { email: email.toLowerCase() },
  });
  const matches = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
  return matches && admin !== null;
}

/**
 * HTTP Basic Auth against platform_admins. Deliberately separate from
 * the CapabilityActor/tenant-scoped pipeline in capabilities/capability.ts
 * - a platform admin acts before and outside any tenant, the same
 * cold-start case docs/db-design.md describes for provision_new_account,
 * so there is no tenantId to build a CapabilityActor from here.
 */
export async function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    res.set("WWW-Authenticate", "Basic");
    res.status(401).json({ error: "Platform admin credentials required" });
    return;
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    res.set("WWW-Authenticate", "Basic");
    res.status(401).json({ error: "Malformed credentials" });
    return;
  }
  const email = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const ok = await verifyPlatformAdmin(email, password);
  if (!ok) {
    res.set("WWW-Authenticate", "Basic");
    res.status(401).json({ error: "Invalid platform admin credentials" });
    return;
  }

  next();
}
