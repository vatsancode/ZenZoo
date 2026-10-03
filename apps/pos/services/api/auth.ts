import { apiPost } from "./client";

export interface SignInResult {
  error: string | null;
}

/**
 * Not wired to a real capability yet - server/api has no /auth/sign-in
 * route, so this genuinely fails today. It's a real network call through
 * the shared client, not an invented stub, so the sign-in form's error
 * handling is exercised against real behavior from day one.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    await apiPost("/auth/sign-in", { email, password });
    return { error: null };
  } catch {
    return { error: "Sign-in isn't connected to the server yet." };
  }
}
