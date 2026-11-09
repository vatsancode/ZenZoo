import { createHash, timingSafeEqual } from "node:crypto";

// PKCE (RFC 7636), S256 only: Claude proves it is the same app that started the sign-in by
// sending a secret (the verifier) whose fingerprint (the challenge) it gave us at the start.

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
/** A base64url SHA-256 is always 43 characters. */
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE_PATTERN.test(value);
}

export function verifierMatchesChallenge(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !VERIFIER_PATTERN.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}
