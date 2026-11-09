import { randomBytes } from "node:crypto";
import { hashAgentToken } from "../auth/agentToken";
import type { TenantTx } from "../shared/tenantContext";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CODE_TTL_SECONDS = 60;

/** A random secret, 256 bits, safe to put in a URL or header. */
export function randomSecret(prefix = ""): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export interface TokenPair {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
}

/**
 * Creates the access and refresh token for a connection and saves only their fingerprints.
 * Runs inside a tenant transaction because agent_tokens is row-level secured.
 */
export async function issueTokenPair(
  tx: TenantTx,
  connection: { tenantId: string; membershipId: string; connectionId: string; name: string },
): Promise<TokenPair> {
  const accessToken = randomSecret("zz_at_");
  const refreshToken = randomSecret("zz_rt_");
  const now = Date.now();
  const base = {
    tenant_id: connection.tenantId,
    membership_id: connection.membershipId,
    connection_id: connection.connectionId,
    name: connection.name,
  };
  await tx.agent_tokens.create({
    data: {
      ...base,
      kind: "access",
      token_prefix: accessToken.slice(0, 8),
      token_hash: hashAgentToken(accessToken),
      expires_at: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
    },
  });
  await tx.agent_tokens.create({
    data: {
      ...base,
      kind: "refresh",
      token_prefix: refreshToken.slice(0, 8),
      token_hash: hashAgentToken(refreshToken),
      expires_at: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
  };
}
