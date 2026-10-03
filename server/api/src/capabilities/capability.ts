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

export class PermissionDeniedError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

export interface CapabilityDefinition<Input, Output> {
  name: string;
  kind: "read" | "action";
  /** Checked before anything else runs - see server/api/auth. */
  requiredPermission: Permission;
  /** Business rules checked after the permission check - see server/api/policies. */
  policies?: Policy<Input>[];
  handler: (actor: CapabilityActor, input: Input) => Promise<Output>;
  /** Called only after a successful execution - see server/api/events. */
  hasPermission: (actor: CapabilityActor, permission: Permission) => boolean | Promise<boolean>;
}

export interface Capability<Input, Output> {
  name: string;
  kind: "read" | "action";
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
    async execute(actor, input) {
      const allowed = await definition.hasPermission(actor, definition.requiredPermission);
      if (!allowed) {
        return {
          ok: false,
          error: {
            code: "PERMISSION_DENIED",
            message: `Actor lacks permission "${definition.requiredPermission}" for capability "${definition.name}"`,
          },
        };
      }

      for (const policy of definition.policies ?? []) {
        try {
          await policy({ actor, input });
        } catch (error) {
          if (error instanceof PolicyViolationError) {
            return { ok: false, error: { code: "POLICY_VIOLATION", message: error.message } };
          }
          throw error;
        }
      }

      try {
        const data = await definition.handler(actor, input);
        return { ok: true, data };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        };
      }
    },
  };
}
