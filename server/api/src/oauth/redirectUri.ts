/**
 * Where a client may be sent back to after the person says Allow. Sending the one-time code to the
 * wrong address would hand someone else access, so registration only accepts:
 *  - https addresses on claude.ai / claude.com (the Claude web and mobile apps), and
 *  - http addresses on this computer (localhost / 127.0.0.1 / ::1), which is how Claude Code and
 *    other desktop tools listen for the answer.
 * A registered address must later match exactly - see authorize.ts.
 */
const CLAUDE_HOSTS = new Set(["claude.ai", "claude.com"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const MAX_LENGTH = 2000;

export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return CLAUDE_HOSTS.has(url.hostname);
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);
  return false;
}
