import type { NextFunction, Request, Response } from "express";
import type { CapabilityActor } from "@zenzoo/types";
import { verifySessionToken } from "../shared/jwt";
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
export function requireTenantUser(req: Request, res: Response, next: NextFunction): void {
  const cookie = readCookie(req, SESSION_COOKIE_NAME);
  const session = cookie ? verifySessionToken<SessionPayload>(cookie) : null;

  if (!session || session.kind !== "tenant_user") {
    res.status(401).json({ error: "Sign-in required" });
    return;
  }

  const actor: CapabilityActor = { userId: session.userId, tenantId: session.tenantId };
  (req as Request & { actor: CapabilityActor }).actor = actor;
  next();
}
