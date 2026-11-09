import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { isValidChallenge, verifierMatchesChallenge } from "./pkce";
import { isAllowedRedirectUri } from "./redirectUri";

function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

test("PKCE: the right verifier matches its challenge", () => {
  const verifier = randomBytes(32).toString("base64url");
  assert.equal(verifierMatchesChallenge(verifier, challengeFor(verifier)), true);
});

test("PKCE: a different verifier is rejected", () => {
  const verifier = randomBytes(32).toString("base64url");
  const other = randomBytes(32).toString("base64url");
  assert.equal(verifierMatchesChallenge(other, challengeFor(verifier)), false);
});

test("PKCE: a missing, short or non-string verifier is rejected", () => {
  const challenge = challengeFor("a".repeat(43));
  assert.equal(verifierMatchesChallenge(undefined, challenge), false);
  assert.equal(verifierMatchesChallenge("short", challenge), false);
  assert.equal(verifierMatchesChallenge(12345, challenge), false);
});

test("PKCE: only a 43-character base64url value counts as a challenge", () => {
  assert.equal(isValidChallenge(challengeFor("x".repeat(50))), true);
  assert.equal(isValidChallenge("too-short"), false);
  assert.equal(isValidChallenge(undefined), false);
});

test("redirect addresses: Claude's own and this computer are allowed", () => {
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirectUri("https://claude.com/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:54321/callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8080/callback"), true);
  assert.equal(isAllowedRedirectUri("http://[::1]:8080/callback"), true);
});

test("redirect addresses: anywhere else is refused", () => {
  assert.equal(isAllowedRedirectUri("https://evil.example/callback"), false);
  assert.equal(isAllowedRedirectUri("https://claude.ai.evil.example/callback"), false);
  assert.equal(isAllowedRedirectUri("https://evil.example/claude.ai"), false);
  assert.equal(isAllowedRedirectUri("http://claude.ai/callback"), false);
  assert.equal(isAllowedRedirectUri("https://localhost/callback"), false);
  assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
  assert.equal(isAllowedRedirectUri("myapp://callback"), false);
});

test("redirect addresses: fragments, embedded logins, empty and non-text values are refused", () => {
  assert.equal(isAllowedRedirectUri("https://claude.ai/cb#frag"), false);
  assert.equal(isAllowedRedirectUri("https://user:pw@claude.ai/cb"), false);
  assert.equal(isAllowedRedirectUri(""), false);
  assert.equal(isAllowedRedirectUri(undefined), false);
  assert.equal(isAllowedRedirectUri(42), false);
});
