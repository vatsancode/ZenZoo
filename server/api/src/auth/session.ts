import type { Request } from "express";

export const SESSION_COOKIE_NAME = "zenzoo_session";

export type SessionPayload =
  | { kind: "platform_admin"; adminId: string }
  | { kind: "tenant_user"; userId: string; tenantId: string };

/**
 * Express has no built-in cookie parsing and this is the only cookie the
 * API reads, so a tiny manual parse avoids pulling in the `cookie`
 * package for one name/value pair.
 */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }
  return null;
}
