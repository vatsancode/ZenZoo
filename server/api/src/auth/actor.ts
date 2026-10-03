import type { Permission } from "../capabilities/capability";
import type { CapabilityActor } from "@zenzoo/types";
import type { Request } from "express";

export type { CapabilityActor };

/**
 * Extracts the actor from an already-authenticated request. Placeholder:
 * real JWT verification depends on the auth provider chosen (see README).
 * Throws rather than returning null/undefined for an unauthenticated
 * request, so a route can never accidentally proceed with no actor.
 */
export function getActor(req: Request): CapabilityActor {
  const actor = (req as Request & { actor?: CapabilityActor }).actor;
  if (!actor) {
    throw new Error("No authenticated actor on request - auth middleware has not run yet");
  }
  return actor;
}

/**
 * Looks up whether an actor holds a given permission. Placeholder: real
 * permission resolution depends on tenant_memberships.role +
 * membership_store_access (see docs/db-design.md), once that lookup is
 * built against the database.
 */
export async function hasPermission(
  _actor: CapabilityActor,
  _permission: Permission,
): Promise<boolean> {
  throw new Error("Permission resolution is not implemented yet");
}
