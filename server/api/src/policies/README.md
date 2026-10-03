# Policies

Business rules a capability must satisfy beyond "is this actor allowed to
call this at all" - the step between the permission check and the handler
in `capabilities/capability.ts`'s pipeline.

A policy is a function of shape `Policy<Input>` (see `capabilities/capability.ts`):
it either passes silently or throws `PolicyViolationError`. Permission
answers "can this actor ever do this kind of thing"; a policy answers
"is this specific request allowed, given the current business state"
(e.g. "a read-only actor must not reach an action capability" is a
permission question; "this purchase order is already approved" is a
policy question).

No policies exist yet because no capabilities exist yet - write a policy
only alongside the capability it protects, not in advance.
