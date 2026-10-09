# Prisma

`schema.prisma` is **generated**, not hand-authored. `docs/db-design.md`
remains the actual source of truth for the database - this folder exists so
the apps/backend have a type-safe client, not to redesign or duplicate that
document.

## How this was built (and how to rebuild it after a schema change)

1. The full DDL in `docs/db-design.md` was extracted and applied to a real
   PostgreSQL 16 database (see `migrations/20261003000000_init/migration.sql`
   for exactly what that DDL is, and the one ordering fix it needed).
2. `prisma db pull` introspected that database into `schema.prisma`.
3. `prisma generate` produced the Prisma Client from it.

To regenerate after `docs/db-design.md` changes:

```sh
# 1. Apply the new DDL to your dev database (psql, or your migration tool
#    of choice) - see the note in migration.sql about uuidv7() and the RLS
#    section's required ordering if you're doing this by hand again.
# 2. Re-introspect:
pnpm exec prisma db pull
# 3. Re-check the diff by hand - Prisma's introspection output is
#    deterministic from the DB, so a diff here should only ever reflect a
#    real schema change, never a surprise.
# 4. Regenerate the client:
pnpm exec prisma generate
```

## What Prisma can't represent

`prisma db pull` correctly captures every table, column, index, and foreign
key - including the two genuinely tricky parts of this schema (the circular
`inventory_batches` ↔ `sale_return_items` FK, and the self-referencing FK on
`customer_credit_ledger`). It cannot represent, and the `///` comments on
affected models say so explicitly:

- **CHECK constraints** - every business rule expressed as a `CHECK` in
  `docs/db-design.md` (status enums, sign rules, totals reconciliation, the
  dual-origin `inventory_batches` constraint, etc.) exists in the real
  database and is enforced there, but is invisible to Prisma Client's own
  types. The application must not assume Prisma's generated types are the
  full set of validation - they are not, by design.
- **Triggers and functions** - every trigger in `docs/db-design.md`
  (`trg_stock_movements_apply_to_batch`, every `require_draft_*` guard, the
  completion/void guards, `provision_new_account`, etc.) runs in the
  database regardless of whether a write came from Prisma, `psql`, or
  anything else. Prisma Client has no knowledge of them.
- **One real relation Prisma can't model exactly as designed:**
  `inventory_batches.sale_return_item_id` is genuinely one-to-one with
  `sale_return_items` (enforced by a real `UNIQUE(sale_return_item_id)` in
  the database), but Prisma's relation modeling requires a `@@unique`
  covering the _entire_ field tuple used in the FK
  (`tenant_id, store_id, sale_return_item_id, variant_id`), not just the
  one column that's actually unique. Originally judged not worth a
  redundant composite unique index purely to satisfy Prisma - revisited
  once that turned out to be a hard `prisma generate` failure (P1012)
  under newer Prisma CLI versions, not just an imprecise type, blocking
  every model's client generation, not only this relation's. See
  `inventory_batches_sale_return_item_relation_unique`
  (migration `20261008010000_inventory_batches_prisma_relation_unique`) -
  a redundant index that can never be violated independently of the
  single-column unique it duplicates, added once "nobody can run
  `prisma generate`" outweighed the earlier objection.
  `sale_return_items.inventory_batches` is therefore typed as an array
  (`inventory_batches[]`) in the generated client, even though the database
  guarantees it will only ever contain zero or one element. Application
  code reading this relation should treat it as "the one return batch, if
  completed" and take `[0]`, not iterate it expecting more.
- **Row-level security** - the `tenant_isolation`/`tenant_membership_or_self`
  policies apply to every query Prisma Client issues, the same as any other
  client connected as `app_role`. Prisma does not manage or display RLS
  policies; `DATABASE_URL` for the application must connect as `app_role`
  (see "Row-level security" and "The application-role privilege model" in
  `docs/db-design.md`) with `app.current_tenant_id`/`app.current_user_id`
  set per request - Prisma has no built-in mechanism for this, so the
  backend sets it explicitly (e.g. via `$executeRaw` at the start of each
  request's transaction) once that wiring is built.

## One schema-document packaging issue found while building this

`docs/db-design.md`'s "Row-level security" section (roles, `ENABLE ROW LEVEL
SECURITY`, `CREATE POLICY`, `provision_new_account`) is written early in the
document, as a cross-cutting concern, before most of the tables it
references are defined. Applied literally top-to-bottom as SQL, it fails -
see the header comment in `migrations/20261003000000_init/migration.sql`
for the exact, minimal reordering fix (statement positions only, no content
changed). This is worth fixing in the document itself the next time it's
edited, so a future reader extracting the DDL again doesn't rediscover the
same ordering problem.

## Local development: `uuidv7()` on Postgres < 18

`docs/db-design.md` targets Postgres 18+, which has `uuidv7()` built in.
This repository's own dev/CI database may be on an earlier version. If so,
run this once against your local database before the migration above -
**development only, never against a real deployment target** (see
`docs/db-design.md`'s own note on `tenants.id` for the two real options,
the `pg_uuidv7` extension or generating it in the application layer):

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION uuidv7() RETURNS UUID AS $$
DECLARE
    unix_ts_ms BYTEA;
    rand_bytes BYTEA;
BEGIN
    unix_ts_ms := substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT) FROM 3 FOR 6);
    rand_bytes := gen_random_bytes(10);
    rand_bytes := set_byte(rand_bytes, 0, (get_byte(rand_bytes, 0) & 15) | 112);
    rand_bytes := set_byte(rand_bytes, 2, (get_byte(rand_bytes, 2) & 63) | 128);
    RETURN encode(unix_ts_ms || rand_bytes, 'hex')::UUID;
END;
$$ LANGUAGE plpgsql VOLATILE;
```
