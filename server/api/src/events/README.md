# Events

The "Event / Audit" step after a capability executes (see
`capabilities/capability.ts`'s pipeline diagram). This is an in-process,
no-op-by-default event bus for now - not Kafka, not a message queue. Add a
real backing transport only when a real consumer needs one (e.g. a
background job reacting to an event across process boundaries).

Note that most of the actual audit trail this product needs already exists
in the database itself - `stock_movements`, `customer_credit_ledger`, and
every header table's own status/timestamps (see docs/db-design.md) are the
durable, queryable record of what happened. This module is for
cross-cutting application events (e.g. "notify something when a sale
completes"), not a replacement for that ledger-level audit trail.
