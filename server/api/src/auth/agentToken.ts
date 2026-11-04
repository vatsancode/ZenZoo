import { createHash } from "node:crypto";

/**
 * Scrambles an agent token into the 64-character fingerprint stored in agent_tokens.token_hash.
 * Only the fingerprint is ever saved, so a leaked database can't be used to act as an agent.
 * Creating a token and checking one both go through this, so the two always agree: whatever an
 * agent sends is scrambled here and matched against find_agent_actor (see the agent_tokens
 * migration).
 */
export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
