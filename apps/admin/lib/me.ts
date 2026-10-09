import { redirectToSignInIfUnauthorized } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface CurrentUser {
  name: string;
  roleName: string | null;
}

/** The actually-signed-in person's own name and role, from the real session - not a hardcoded id. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${API_URL}/me`, { credentials: "include" });
  if (!response.ok) {
    redirectToSignInIfUnauthorized(response);
    return null;
  }
  return (await response.json()) as CurrentUser;
}
