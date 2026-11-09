import type { ZodType } from "zod";
import { hasAnyPermission } from "../auth/actor";
import type { CapabilityActor, CapabilityResult } from "@zenzoo/types";

/**
 * The shared execution pipeline every capability goes through, regardless
 * of caller (POS, Admin, internal AI, or a future MCP interface):
 *
 *   Actor -> Permission check -> Policy check(s) -> handler -> result
 *
 * This file defines the mechanism. It defines zero actual capabilities -
 * those live under reads/ and actions/, created only once the business
 * workflow behind them actually exists (see those folders' README).
 */

export type Permission = string;

export interface PolicyContext<Input> {
  actor: CapabilityActor;
  input: Input;
}

/** A policy either passes (returns nothing) or fails with a reason. */
export type Policy<Input> = (context: PolicyContext<Input>) => void | Promise<void> | never;

export class PolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyViolationError";
  }
}

/**
 * Thrown from a handler when the request was fine but the world has moved on since the caller
 * last looked - a price changed, the stock ran out. Comes back as CONFLICT (409), so a till can
 * tell "review and try again" apart from "that was never a valid request".
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Thrown from a handler when the record asked for isn't there (or belongs to another shop, which
 * looks the same from here). Comes back as NOT_FOUND (404), so a screen can show "not found"
 * rather than treating it as a failed load to retry.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class PermissionDeniedError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

export interface CapabilityDefinition<Input, Output> {
  name: string;
  kind: "read" | "action";
  /**
   * What this does, written for an AI agent choosing between tools. Read only by the MCP server;
   * a capability without one is not offered there.
   */
  description?: string;
  /**
   * The shape of `input`, for the MCP server to publish. Express and execute() never parse with it -
   * the routes keep validating however they do today.
   */
  input?: ZodType<Input, unknown>;
  /**
   * Checked before anything else runs - see server/api/auth. A list means "any one of these":
   * only for a read that several areas' screens share (see capabilities/lookups), never to
   * widen what one area can reach.
   */
  requiredPermission: Permission | readonly Permission[];
  /** Business rules checked after the permission check - see server/api/policies. */
  policies?: Policy<Input>[];
  handler: (actor: CapabilityActor, input: Input) => Promise<Output>;
}

export interface Capability<Input, Output> {
  name: string;
  kind: "read" | "action";
  description?: string;
  input?: ZodType<Input, unknown>;
  execute: (actor: CapabilityActor, input: Input) => Promise<CapabilityResult<Output>>;
}

/**
 * Wraps a handler with the permission/policy pipeline. The handler itself
 * can trust, by the time it runs, that the actor is both authorized and
 * policy-compliant - authorization is never the AI's or the caller's job to
 * enforce (see docs/requirements.md's capability rules).
 */
export function defineCapability<Input, Output>(
  definition: CapabilityDefinition<Input, Output>,
): Capability<Input, Output> {
  return {
    name: definition.name,
    kind: definition.kind,
    description: definition.description,
    input: definition.input,
    async execute(actor, input) {
      // The permission check and the policies read the database. If that fails (database down,
      // slow, connection reset), come back with a plain error result instead of throwing - a throw
      // here escapes the route and can stop the whole API.
      try {
        const required = [definition.requiredPermission].flat();
        const allowed = await hasAnyPermission(actor, required);
        if (!allowed) {
          return {
            ok: false,
            error: {
              code: "PERMISSION_DENIED",
              // Plain words for the person on screen; the technical detail goes to the log.
              message: "You don't have access to do this. Ask the owner to change your role.",
            },
          };
        }

        for (const policy of definition.policies ?? []) {
          await policy({ actor, input });
        }
      } catch (error) {
        if (error instanceof PolicyViolationError) {
          return { ok: false, error: { code: "POLICY_VIOLATION", message: error.message } };
        }
        console.error(`[capability] ${definition.name}: permission or policy check failed:`, error);
        return {
          ok: false,
          error: { code: "INTERNAL_ERROR", message: "Temporary problem, please try again." },
        };
      }

      try {
        const data = await definition.handler(actor, input);
        return { ok: true, data };
      } catch (error) {
        if (error instanceof ConflictError) {
          return { ok: false, error: { code: "CONFLICT", message: error.message } };
        }
        if (error instanceof NotFoundError) {
          return { ok: false, error: { code: "NOT_FOUND", message: error.message } };
        }
        return {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : "Something went wrong. Please try again.",
          },
        };
      }
    },
  };
}
