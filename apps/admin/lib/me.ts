import { redirectToSignInIfUnauthorized } from "./auth";
import type { AccessLevel, PermissionArea } from "../features/settings/users";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface CurrentUser {
  name: string;
  roleName: string | null;
  /** What the person's role allows, per area. Used to leave out what they can't use; the API enforces it. */
  permissions: Record<PermissionArea, AccessLevel>;
}

/** The actually-signed-in person's own name, role and permissions, from the real session - not a hardcoded id. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${API_URL}/me`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return null;
  }
  return (await response.json()) as CurrentUser;
}
