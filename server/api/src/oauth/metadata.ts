import type { Request, Response } from "express";
import { mcpResourceUrl, publicApiUrl } from "./config";

/** RFC 9728: tells Claude which sign-in server protects /mcp. */
export function protectedResourceMetadata(_req: Request, res: Response): void {
  res.json({
    resource: mcpResourceUrl(),
    authorization_servers: [publicApiUrl()],
    bearer_methods_supported: ["header"],
    resource_name: "ZenZoo",
  });
}

/** RFC 8414: where Claude registers, asks the person to approve, and swaps the code for tokens. */
export function authorizationServerMetadata(_req: Request, res: Response): void {
  const base = publicApiUrl();
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
