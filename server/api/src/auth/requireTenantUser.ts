import type { NextFunction, Request, Response } from "express";
import type { CapabilityActor } from "@zenzoo/types";
import { verifySessionToken } from "../shared/jwt";
import { runInTenantContext } from "../shared/tenantContext";
import { readCookie, SESSION_COOKIE_NAME, type SessionPayload } from "./session";

/**
 * Verifies the session cookie set by POST /auth/sign-in and, for a
 * tenant_user session, sets req.actor to a CapabilityActor so getActor()
 * (see ./actor.ts) and every capability built on defineCapability() has
 * something to run permission checks against. Deliberately rejects a
 * platform_admin session here, the mirror image of requirePlatformAdmin
 * rejecting a tenant_user one - the two pipelines stay separate (see
 * platform-admin.ts's own doc comment).
 */
export async function requireTenantUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const cookie = readCookie(req, SESSION_COOKIE_NAME);
  const session = cookie ? verifySessionToken<SessionPayload>(cookie) : null;

  if (!session || session.kind !== "tenant_user") {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  const actor: CapabilityActor = { userId: session.userId, tenantId: session.tenantId };

  try {
    // The cookie stays valid after an admin turns someone off, so confirm
    // their access is still on - otherwise they keep a signed-in-looking
    // page that only shows 403s. A 401 sends the browser to sign-in.
    const stillActive = await runInTenantContext(actor, (tx) =>
      tx.tenant_memberships.findFirst({
        where: { tenant_id: actor.tenantId, user_id: actor.userId, status: "active" },
        select: { id: true },
      }),
    );
    if (!stillActive) {
      res.status(401).json({ error: "Sign-in required" });
      return;
    }
  } catch (error) {
    next(error);
    return;
  }

  (req as Request & { actor: CapabilityActor }).actor = actor;
  next();
}
