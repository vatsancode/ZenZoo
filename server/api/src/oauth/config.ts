/**
 * Where this API and the Admin app live, as the outside world sees them. Claude's servers read
 * these addresses from the discovery documents, so in production PUBLIC_API_URL must be the public
 * https address (not localhost). Locally, claude.ai cannot reach localhost - use a tunnel.
 */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** The API's public address, e.g. https://api.example.com (no trailing slash). */
export function publicApiUrl(): string {
  return trimTrailingSlash(
    process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  );
}

/** The address Claude connects to. */
export function mcpResourceUrl(): string {
  return `${publicApiUrl()}/mcp`;
}

/** Where the consent page lives: the Admin app. */
export function adminOrigin(): string {
  return trimTrailingSlash(process.env.FRONTEND_ORIGIN ?? "http://localhost:3000");
}
