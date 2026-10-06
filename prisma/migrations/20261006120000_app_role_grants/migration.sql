-- The init migration created app_role and enabled RLS/policies on every
-- tenant-owned table, but never ran the per-table GRANT/REVOKE statements
-- from docs/db-design.md's "The application-role privilege model" section.
-- Without these, app_role has zero table privileges and every query fails
-- with "permission denied for table X" regardless of RLS - grants and RLS
-- are two independent layers that both have to allow a statement (see that
-- section's own closing note). This migration applies exactly the DDL
-- written there, verbatim.

-- Group 1: ordinary tenant-owned headers/catalogue/config rows. Content and
-- status columns change in place; nothing in this group is ever
-- hard-deleted by the application, so DELETE is deliberately not granted.
GRANT SELECT, INSERT, UPDATE ON
    stores, tenant_memberships, suppliers, sellables, variants, customers,
    payment_methods, payment_accounts, purchases, purchase_returns, sales, sale_returns
    TO app_role;

-- Group 2: draft-mutable line items. Each is real-DELETE-able, but only
-- while draft - enforced by each table's own require-draft-parent trigger;
-- this grant is the privilege-level precondition those triggers assume.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    purchase_items, purchase_return_items, sale_items, sale_item_batches,
    sale_return_items, sale_payments
    TO app_role;

-- Group 3: membership_store_access has no content/status column - you add
-- or remove a row rather than editing one - so it gets DELETE, not UPDATE.
GRANT SELECT, INSERT, DELETE ON membership_store_access TO app_role;

-- Group 4: append-only or otherwise write-once tables. No UPDATE, no
-- DELETE: tenants (status transitions are a platform-admin operation, not
-- yet built), inventory_batches (immutable except available_quantity,
-- which is trigger-only), stock_movements and customer_credit_ledger
-- (append-only ledgers, enforced by their own append-only triggers).
GRANT SELECT, INSERT ON tenants, inventory_batches, stock_movements, customer_credit_ledger TO app_role;

-- Explicit, redundant-but-intentional belt-and-suspenders: app_role was
-- never granted table-wide UPDATE on these three above, so this changes
-- nothing functionally - it exists so "app_role cannot modify
-- available_quantity / cannot update or delete the ledgers" is a literal,
-- greppable statement, not just an absence someone has to notice.
REVOKE UPDATE (available_quantity) ON inventory_batches FROM app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON stock_movements FROM app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON customer_credit_ledger FROM app_role;

-- users: no INSERT at all - the only way a users row is ever created is
-- the dedicated SECURITY DEFINER provision_new_account() function, never a
-- direct app_role insert. SELECT/UPDATE are governed by the
-- tenant_membership_or_self policy from "Row-level security".
GRANT SELECT, UPDATE ON users TO app_role;
