# Capabilities

Business operations, not UI buttons. A capability represents something the
business actually does ("approve this purchase order"), not a screen action
("the button the approve screen has").

Every interface - POS, Admin, internal AI, external agents, a future MCP
server - calls the same capabilities here. None of them get their own copy
of the business logic.

- `capability.ts` - the shared execution pipeline (permission check -> policy
  check -> handler). This is the only file in this folder for now.
- `reads/` - read-only capabilities (e.g. `get_inventory`).
- `actions/` - capabilities with a side effect (e.g. `create_purchase_order`).

Do not add a capability until the workflow behind it is actually being
built - domains are discovered progressively, not designed upfront. An
empty `reads/`/`actions/` folder is the correct state until then.

Every capability should eventually define: purpose, inputs, required
permission, preconditions, policies, side effects, possible failures, and
its result shape - `defineCapability()` is where that contract becomes code.
