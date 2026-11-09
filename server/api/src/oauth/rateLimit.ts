import { rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";

/**
 * Per-address limits for the sign-in endpoints, which anyone on the internet can reach. Counts live
 * in this server's memory (fine for one API server). Starting values - revisit with real traffic.
 */
const WINDOW_MS = 60_000;

function tooManyRequests(_req: Request, res: Response): void {
  res.set("Retry-After", String(WINDOW_MS / 1000));
  res.status(429).json({
    error: "too_many_requests",
    error_description: "Rate limit exceeded, try again after 60 seconds.",
  });
}

function limiter(limit: number) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: tooManyRequests,
  });
}

/** Registering creates a database row for anyone who asks, so it is the tightest. */
export const registerLimiter = limiter(10);
export const authorizeLimiter = limiter(60);
export const tokenEndpointLimiter = limiter(60);
