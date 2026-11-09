import type { Response, Request } from "express";
import { hashAgentToken } from "../auth/agentToken";
import { prisma } from "../shared/prisma";
import { runInTenantContext } from "../shared/tenantContext";
import { oauthError } from "./http";
import { verifierMatchesChallenge } from "./pkce";
import { issueTokenPair } from "./tokens";

/** A refresh token swapped a moment ago may be retried by a client that missed the answer. */
const REPLAY_GRACE_MS = 10_000;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function invalidGrant(res: Response): void {
  oauthError(res, 400, "invalid_grant", "The code or refresh token is invalid, expired or used.");
}

/** POST /oauth/token - swaps a one-time code, or a refresh token, for a fresh pair of tokens. */
export async function token(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  res.set({ "Cache-Control": "no-store", Pragma: "no-cache" });

  switch (body.grant_type) {
    case "authorization_code":
      return exchangeCode(body, res);
    case "refresh_token":
      return refresh(body, res);
    default:
      oauthError(res, 400, "unsupported_grant_type", "Use authorization_code or refresh_token.");
  }
}

async function exchangeCode(body: Record<string, unknown>, res: Response): Promise<void> {
  const code = text(body.code);
  const clientId = text(body.client_id);
  const redirectUri = text(body.redirect_uri);
  if (!code || !clientId || !redirectUri) {
    oauthError(res, 400, "invalid_request", "code, client_id and redirect_uri are required.");
    return;
  }

  const row = await prisma.oauth_codes.findUnique({
    where: { code_hash: hashAgentToken(code) },
    include: { oauth_clients: { select: { name: true } } },
  });
  if (
    !row ||
    row.used_at ||
    row.expires_at <= new Date() ||
    row.client_id !== clientId ||
    row.redirect_uri !== redirectUri ||
    !verifierMatchesChallenge(body.code_verifier, row.code_challenge)
  ) {
    invalidGrant(res);
    return;
  }

  // Claim the code before anything else, so two requests with the same code can't both win.
  const claimed = await prisma.oauth_codes.updateMany({
    where: { id: row.id, used_at: null },
    data: { used_at: new Date() },
  });
  if (claimed.count !== 1) {
    invalidGrant(res);
    return;
  }

  const pair = await runInTenantContext(
    { tenantId: row.tenant_id, userId: row.user_id },
    async (tx) => {
      const membership = await tx.tenant_memberships.findFirst({
        where: {
          id: row.membership_id,
          tenant_id: row.tenant_id,
          user_id: row.user_id,
          status: "active",
        },
        select: { id: true },
      });
      if (!membership) return null;
      const connection = await tx.agent_connections.create({
        data: {
          tenant_id: row.tenant_id,
          membership_id: membership.id,
          client_id: row.client_id,
          name: row.oauth_clients.name,
          last_used_at: new Date(),
        },
        select: { id: true },
      });
      return issueTokenPair(tx, {
        tenantId: row.tenant_id,
        membershipId: membership.id,
        connectionId: connection.id,
        name: row.oauth_clients.name,
      });
    },
  );
  if (!pair) {
    invalidGrant(res);
    return;
  }
  res.json(pair);
}

interface RefreshRow {
  token_id: string;
  tenant_id: string;
  user_id: string;
  membership_id: string;
  connection_id: string;
  client_id: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  replaced_at: Date | null;
  usable: boolean;
}

async function refresh(body: Record<string, unknown>, res: Response): Promise<void> {
  const refreshToken = text(body.refresh_token);
  const clientId = text(body.client_id);
  if (!refreshToken || !clientId) {
    oauthError(res, 400, "invalid_request", "refresh_token and client_id are required.");
    return;
  }

  const rows = await prisma.$queryRaw<RefreshRow[]>`
    SELECT * FROM find_agent_refresh(${hashAgentToken(refreshToken)})
  `;
  const row = rows[0];
  if (!row || row.client_id !== clientId) {
    invalidGrant(res);
    return;
  }
  const actor = { tenantId: row.tenant_id, userId: row.user_id };

  // An already-swapped refresh token coming back later means a copy leaked: shut the whole
  // connection down so both holders have to sign in again.
  if (row.replaced_at) {
    if (Date.now() - row.replaced_at.getTime() > REPLAY_GRACE_MS) {
      const now = new Date();
      await runInTenantContext(actor, async (tx) => {
        await tx.agent_connections.updateMany({
          where: { id: row.connection_id, revoked_at: null },
          data: { revoked_at: now },
        });
        await tx.agent_tokens.updateMany({
          where: { connection_id: row.connection_id, revoked_at: null },
          data: { revoked_at: now },
        });
      });
    }
    invalidGrant(res);
    return;
  }

  if (row.revoked_at || !row.usable || (row.expires_at && row.expires_at <= new Date())) {
    invalidGrant(res);
    return;
  }

  const pair = await runInTenantContext(actor, async (tx) => {
    // Mark the old one spent first; if another request already did, this one loses.
    const spent = await tx.agent_tokens.updateMany({
      where: { id: row.token_id, replaced_at: null, revoked_at: null },
      data: { replaced_at: new Date() },
    });
    if (spent.count !== 1) return null;
    const connection = await tx.agent_connections.update({
      where: { id: row.connection_id },
      data: { last_used_at: new Date() },
      select: { name: true },
    });
    return issueTokenPair(tx, {
      tenantId: row.tenant_id,
      membershipId: row.membership_id,
      connectionId: row.connection_id,
      name: connection.name,
    });
  });
  if (!pair) {
    invalidGrant(res);
    return;
  }
  res.json(pair);
}
