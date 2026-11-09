import type { Request, Response } from "express";

/** An OAuth-style error body (RFC 6749 section 5.2). */
export function oauthError(
  res: Response,
  status: number,
  error: string,
  description: string,
): void {
  res.status(status).json({ error, error_description: description });
}

/**
 * Wraps an OAuth handler so a failure (the database being down, say) is logged and answered with a
 * 503 instead of escaping to Express 4, which ignores rejected promises and would let Node stop
 * the whole API. See the /mcp handler for the same rule.
 */
export function safe(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("[oauth] request failed:", error);
      if (!res.headersSent) {
        oauthError(res, 503, "temporarily_unavailable", "Temporary problem, please try again.");
      }
    }
  };
}
