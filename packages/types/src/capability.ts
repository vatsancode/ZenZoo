/**
 * Generic shape of a capability result and its failure modes (see
 * server/api/capabilities). Deliberately infrastructure-shaped, not
 * domain-shaped: it says nothing about sales, inventory, or any other
 * business concept, only the envelope every capability call returns.
 */

export type CapabilityFailureCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PERMISSION_DENIED"
  | "POLICY_VIOLATION"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export interface CapabilityFailure {
  code: CapabilityFailureCode;
  message: string;
  details?: Record<string, unknown>;
}

export type CapabilityResult<T> = { ok: true; data: T } | { ok: false; error: CapabilityFailure };

/**
 * Who is calling a capability, and in which tenant's context. Every
 * capability call is made on behalf of an actor - never called anonymously
 * - so the backend always has something to run permission/policy checks
 * against (see server/api/capabilities and server/api/policies).
 */
export interface CapabilityActor {
  userId: string;
  tenantId: string;
  storeId?: string;
}
