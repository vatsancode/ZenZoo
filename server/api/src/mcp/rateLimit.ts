import type { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { hashAgentToken } from "../auth/agentToken";

/**
 * Rate limits for POST /mcp, so one overeager or malicious agent cannot hammer the database and
 * slow the POS and Admin down for everyone else. Counts are kept in this server's memory, which
 * is fine for one API server; with several, each would count on its own (use a shared store then).
 * The numbers are starting values - revisit them after benchmarking real agent traffic.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_TOKEN = 60;
const MAX_FAILED_TOKENS_PER_IP = 20;

const RATE_LIMITED_MESSAGE = "Rate limit exceeded, try again after 60 seconds.";

function tooManyRequests(_req: Request, res: Response): void {
  res.set("Retry-After", String(WINDOW_MS / 1000));
  res.status(429).json({ error: RATE_LIMITED_MESSAGE });
}

/** The token an agent sent, or undefined when there is no Bearer token. */
function bearerToken(req: Request): string | undefined {
  return req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
}

/**
 * Per IP address, counting only "unknown or revoked token" answers (401). Stops someone guessing
 * tokens in bulk, which would cost a database lookup per guess. A database failure (503) is not the
 * caller's mistake, so it is not counted - an outage must never lock out good agents. A valid
 * token never counts, so agents sharing an address are not penalised for each other's successes.
 */
export const failedTokenLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_FAILED_TOKENS_PER_IP,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  handler: tooManyRequests,
});

/**
 * Per token: 60 requests a minute, counted by the scrambled token (never stored in the clear), so
 * one noisy agent cannot use up another's allowance. A request with no token is skipped here - the
 * handler answers it with 401 and the per-IP limiter above counts that.
 */
export const tokenLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_REQUESTS_PER_TOKEN,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => !bearerToken(req),
  keyGenerator: (req) => hashAgentToken(bearerToken(req) ?? ""),
  handler: tooManyRequests,
});
