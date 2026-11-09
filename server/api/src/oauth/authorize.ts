import type { Request, Response } from "express";
import { getActor } from "../auth/actor";
import { hashAgentToken } from "../auth/agentToken";
import { getCurrentUser } from "../modules/self/getCurrentUser";
import { prisma } from "../shared/prisma";
import { runInTenantContext } from "../shared/tenantContext";
import { adminOrigin, mcpResourceUrl } from "./config";
import { oauthError } from "./http";
import { isValidChallenge } from "./pkce";
import { CODE_TTL_SECONDS, randomSecret } from "./tokens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STATE_LENGTH = 2000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface AuthorizationRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | undefined;
}

export type AuthorizationCheck =
  | { ok: true; request: AuthorizationRequest }
  | {
      ok: false;
      error: string;
      description: string;
      /** Set only when the client and redirect address are trusted, so the error may be sent there. */
      redirectUri?: string;
      state?: string;
    };

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Appends OAuth answer fields (code, error, state ...) to a client's redirect address. */
export function buildRedirect(
  redirectUri: string,
  fields: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Checks a sign-in request from Claude. The client and the redirect address are checked first and
 * against what was registered (exact match); only then is it safe to send any later error back to
 * that address.
 */
export async function checkAuthorizationRequest(
  params: Record<string, unknown>,
): Promise<AuthorizationCheck> {
  const clientId = text(params.client_id);
  const redirectUri = text(params.redirect_uri);
  if (!clientId || !UUID.test(clientId) || !redirectUri) {
    return { ok: false, error: "invalid_request", description: "Unknown app or address." };
  }

  const client = await prisma.oauth_clients.findUnique({ where: { id: clientId } });
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return { ok: false, error: "invalid_request", description: "Unknown app or address." };
  }

  const state = text(params.state);
  const fail = (error: string, description: string): AuthorizationCheck => ({
    ok: false,
    error,
    description,
    redirectUri,
    state,
  });

  if (state !== undefined && state.length > MAX_STATE_LENGTH) {
    return fail("invalid_request", "state is too long.");
  }
  if (text(params.response_type) !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }
  if (!isValidChallenge(params.code_challenge) || text(params.code_challenge_method) !== "S256") {
    return fail("invalid_request", "A PKCE code_challenge with method S256 is required.");
  }
  const resource = text(params.resource);
  if (resource !== undefined && resource.replace(/\/+$/, "") !== mcpResourceUrl()) {
    return fail("invalid_target", "resource must be this server's /mcp address.");
  }

  return {
    ok: true,
    request: {
      clientId: client.id,
      clientName: client.name,
      redirectUri,
      codeChallenge: params.code_challenge,
      state,
    },
  };
}

/**
 * GET /oauth/authorize - where Claude sends the person's browser. Nothing is decided here: a valid
 * request is passed on to the Admin app's consent page, where the person (signed in as usual)
 * chooses Allow or Cancel.
 */
export async function authorize(req: Request, res: Response): Promise<void> {
  const check = await checkAuthorizationRequest(req.query);
  if (!check.ok) {
    if (check.redirectUri) {
      res.redirect(
        302,
        buildRedirect(check.redirectUri, {
          error: check.error,
          error_description: check.description,
          state: check.state,
        }),
      );
      return;
    }
    oauthError(res, 400, check.error, check.description);
    return;
  }

  const { request } = check;
  const consent = new URL(`${adminOrigin()}/connect`);
  consent.searchParams.set("client_id", request.clientId);
  consent.searchParams.set("redirect_uri", request.redirectUri);
  consent.searchParams.set("code_challenge", request.codeChallenge);
  consent.searchParams.set("code_challenge_method", "S256");
  consent.searchParams.set("response_type", "code");
  if (request.state !== undefined) consent.searchParams.set("state", request.state);
  res.redirect(302, consent.toString());
}

/** GET /oauth/consent - what the consent page shows: who is asking, for which shop and person. */
export async function consentDetails(req: Request, res: Response): Promise<void> {
  const check = await checkAuthorizationRequest(req.query);
  if (!check.ok) {
    res.status(400).json({ error: "This connection request isn't valid. Start again from Claude." });
    return;
  }

  const actor = getActor(req);
  const [me, shopName] = await Promise.all([
    getCurrentUser(actor),
    runInTenantContext(actor, async (tx) => {
      const tenant = await tx.tenants.findFirst({
        where: { id: actor.tenantId },
        select: { name: true },
      });
      return tenant?.name ?? null;
    }),
  ]);
  res.json({
    clientName: check.request.clientName,
    shopName,
    userName: me.name,
    roleName: me.roleName,
  });
}

/**
 * POST /oauth/consent - the person pressed Allow or Cancel. Allow creates a one-time code and
 * returns the address to send the browser back to Claude with; Cancel returns the same address
 * with error=access_denied.
 */
export async function consentDecision(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const check = await checkAuthorizationRequest(body);
  if (!check.ok) {
    res.status(400).json({ error: "This connection request isn't valid. Start again from Claude." });
    return;
  }
  const { request } = check;

  if (body.decision !== "allow") {
    res.json({
      redirectUrl: buildRedirect(request.redirectUri, {
        error: "access_denied",
        error_description: "The person chose not to connect.",
        state: request.state,
      }),
    });
    return;
  }

  const actor = getActor(req);
  const membershipId = await runInTenantContext(actor, async (tx) => {
    const membership = await tx.tenant_memberships.findFirst({
      where: { tenant_id: actor.tenantId, user_id: actor.userId, status: "active" },
      select: { id: true },
    });
    return membership?.id ?? null;
  });
  if (!membershipId) {
    res.status(403).json({ error: "Your access to this shop is switched off." });
    return;
  }

  const code = randomSecret();
  await prisma.oauth_codes.deleteMany({
    where: { expires_at: { lt: new Date(Date.now() - ONE_DAY_MS) } },
  });
  await prisma.oauth_codes.create({
    data: {
      code_hash: hashAgentToken(code),
      client_id: request.clientId,
      tenant_id: actor.tenantId,
      membership_id: membershipId,
      user_id: actor.userId,
      redirect_uri: request.redirectUri,
      code_challenge: request.codeChallenge,
      expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
    },
  });

  res.json({ redirectUrl: buildRedirect(request.redirectUri, { code, state: request.state }) });
}
