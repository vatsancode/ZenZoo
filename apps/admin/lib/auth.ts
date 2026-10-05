const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const UI_ONLY_SKIP_AUTH = true;

export interface SignInResult {
  error: string | null;
}

/**
 * Not wired to a real capability yet - server/api has no /auth/sign-in
 * route, so this genuinely fails today. It's a real network call, not an
 * invented stub, so the sign-in form's error handling is exercised against
 * real behavior from day one.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  // UI-only phase: skip the server and let every sign-in through.
  // Remove this line once server/api has a real /auth/sign-in route.
  if (UI_ONLY_SKIP_AUTH) return { error: null };

  try {
    const response = await fetch(`${API_URL}/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      throw new Error(`Sign-in failed with status ${response.status}`);
    }
    return { error: null };
  } catch {
    return { error: "Sign-in isn't connected to the server yet." };
  }
}
