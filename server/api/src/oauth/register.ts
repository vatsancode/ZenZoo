import type { Request, Response } from "express";
import { prisma } from "../shared/prisma";
import { oauthError } from "./http";
import { isAllowedRedirectUri } from "./redirectUri";

const MAX_REDIRECT_URIS = 10;

/**
 * POST /oauth/register - dynamic client registration (RFC 7591). Claude introduces itself here
 * before the first sign-in. Every client is a public client (no secret): its safety comes from
 * PKCE and from the redirect addresses being limited to Claude's own (see redirectUri.ts).
 */
export async function registerClient(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const uris = body.redirect_uris;

  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > MAX_REDIRECT_URIS ||
    !uris.every(isAllowedRedirectUri)
  ) {
    oauthError(
      res,
      400,
      "invalid_redirect_uri",
      "redirect_uris must be 1-10 addresses on claude.ai, claude.com or this computer.",
    );
    return;
  }

  const rawName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const name = (rawName || "MCP client").slice(0, 100);
  const redirectUris = [...new Set(uris as string[])];

  const client = await prisma.oauth_clients.create({
    data: { name, redirect_uris: redirectUris },
    select: { id: true },
  });

  res.status(201).json({
    client_id: client.id,
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(Date.now() / 1000),
  });
}
