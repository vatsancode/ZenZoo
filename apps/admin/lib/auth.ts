const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type SessionKind = "platform_admin" | "tenant_user";

export interface SignInResult {
  error: string | null;
  kind: SessionKind | null;
}

/**
 * Calls the real POST /auth/sign-in route. The server sets the session as
 * an httpOnly cookie on success - credentials: "include" is what makes the
 * browser send/receive it, since this app and the API run on different
 * ports (different origins) in dev.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    const response = await fetch(`${API_URL}/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      return { error: "Invalid email or password.", kind: null };
    }
    const data = (await response.json()) as { kind: SessionKind };
    return { error: null, kind: data.kind };
  } catch {
    return { error: "Couldn't reach the server. Is it running?", kind: null };
  }
}

/** Clears the session cookie on the server. The cookie is httpOnly, so this is the only way to clear it. */
export async function signOut(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/sign-out`, { method: "POST", credentials: "include" });
  } catch {
    // Best-effort - the user is navigated to sign-in regardless.
  }
}

/**
 * A missing or expired session shows up as a 401 from any platform-admin
 * route. Rather than surface that as a generic error, send the admin back
 * to the sign-in page.
 */
export function redirectToSignInIfUnauthorized(response: Response): void {
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = "/sign-in";
  }
}
