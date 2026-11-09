import express, { type Express } from "express";
import { requireTenantUser } from "../auth/requireTenantUser";
import { authorize, consentDecision, consentDetails } from "./authorize";
import { disconnect, listConnections } from "./connections";
import { safe } from "./http";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata";
import { authorizeLimiter, registerLimiter, tokenEndpointLimiter } from "./rateLimit";
import { registerClient } from "./register";
import { token } from "./token";

/**
 * How Claude signs in (OAuth 2.1 with PKCE, MCP's standard): discovery documents, client
 * registration, the approval step, and the token swap. Every handler that touches the database is
 * wrapped in safe() so a database hiccup answers 503 instead of stopping the API.
 */
export function registerOauthRoutes(app: Express): void {
  app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
  app.get("/.well-known/oauth-protected-resource/mcp", protectedResourceMetadata);
  app.get("/.well-known/oauth-authorization-server", authorizationServerMetadata);

  app.post("/oauth/register", registerLimiter, safe(registerClient));
  app.get("/oauth/authorize", authorizeLimiter, safe(authorize));
  app.get("/oauth/consent", requireTenantUser, safe(consentDetails));
  app.post("/oauth/consent", requireTenantUser, safe(consentDecision));
  // Token requests arrive form-encoded (the OAuth standard); JSON is already parsed globally.
  app.post(
    "/oauth/token",
    tokenEndpointLimiter,
    express.urlencoded({ extended: false }),
    safe(token),
  );

  app.get("/agent-connections", requireTenantUser, safe(listConnections));
  app.delete("/agent-connections/:id", requireTenantUser, safe(disconnect));
}
