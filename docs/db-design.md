# ZenZoo — Database Design

Postgres schema for the multi-tenant retail/F&B platform. See [requirements.md](requirements.md) for the product context — in particular §06 (unified domain model) and N-05 (shared schema, `tenant_id` everywhere, RLS as backstop).

---

## `tenants`

The root of the multi-tenancy model. Every other table hangs off `tenant_id` and is expected to carry a row-level security policy scoped to it.

```sql
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    name                VARCHAR(200) NOT NULL,
    slug                VARCHAR(100) NOT NULL UNIQUE
                            CONSTRAINT tenants_slug_lowercase_check
                            CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9-]+$'),
    status              VARCHAR(20) NOT NULL
                            CONSTRAINT tenants_status_check
                            CHECK (status IN ('trial', 'active', 'suspended', 'archived')),
    default_currency    CHAR(3) NOT NULL DEFAULT 'INR',
    default_timezone    VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    country_code        CHAR(2) NOT NULL DEFAULT 'IN',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_status ON tenants (status);

-- shared by every table below — one generic trigger function, not one per table
CREATE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_set_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- slug is immutable once set — reassigning it would break any external
-- reference (subdomain, API path, cached link)
CREATE FUNCTION tenants_prevent_slug_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.slug <> OLD.slug THEN
        RAISE EXCEPTION 'tenants.slug is immutable and cannot be changed (tenant %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_prevent_slug_change
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION tenants_prevent_slug_change();
```

### Notes

- **`id`** — UUIDv7 so IDs are time-sortable (useful for created-order pagination and index locality) without leaking a serial count. Postgres 18+ has `uuidv7()` built in; on earlier versions, use the `pg_uuidv7` extension or generate it in the application layer.
- **`slug`** — unique, URL-safe identifier (subdomain, API path segment). Enforced lowercase and `[a-z0-9-]` only via `CHECK` (plain `UNIQUE`, no `CITEXT`, so `MyShop` and `myshop` collide at the constraint rather than silently coexisting). **Immutable after creation** — a `BEFORE UPDATE` trigger rejects any attempt to change it, since external references (URLs, integrations, cached links) would break otherwise. The application layer should treat `slug` as write-once too, so the DB rejection is a backstop, not the primary UX.
- **`name`** — free to change; it's the display label, not an identifier.
- **`status`** — lifecycle: `trial` → `active` → `suspended` (non-payment/abuse, reversible) → `archived` (terminal soft-delete). **No hard delete and no `deleted_at` column** — `archived` is the delete state. The row and all its tenant-scoped data stay in place, governed by whatever compliance retention rules apply (N-09's six-year invoice retention, N-10's DPDP deletion obligations) rather than by a Postgres `DELETE`. If a "right to erasure" request ever requires actually scrubbing PII, that's a deliberate, audited data-scrubbing job against an `archived` tenant — not a schema-level delete. `cancelled` is deliberately **not** a separate status: a subscription being cancelled and a tenant's data being archived are different facts (one is a billing-system concept, one is a data-lifecycle concept) and conflating them into one status column was a mistake in the earlier draft. Billing/subscription state belongs on a future `subscriptions` table; `archived` here means only "this tenant is done, data retained per policy." Revisit if billing needs finer states (e.g. `past_due`) — those still belong off this table.
- **`default_currency` / `country_code`** — tenant-level defaults; per-store overrides (for multi-country chains) belong on a future `stores` table, not here.
- **`updated_at`** — auto-maintained by trigger above; no application code should set it directly.
- **RLS** — `tenants` is the one table *without* a `tenant_id` column (it *is* the tenant), so it sits outside the standard per-tenant RLS pattern used elsewhere (N-05) and is deliberately left out of "Row-level security" below. Access should instead be gated by a platform-admin role/claim, decided when the auth model is designed. `app_role` gets `SELECT, INSERT` only (see "The application-role privilege model") — new tenants are created (directly, or via the signup bootstrap function — see "Bootstrapping") but never updated by the ordinary application role; a future platform-admin role is where `UPDATE` (suspend/archive) would live.
- Deliberately **excluded for now**: `owner_user_id` / `owner_email` (waiting on the users/auth model) and a `metadata JSONB` catch-all (adding one prematurely invites unstructured drift — add it only when a concrete unstructured need shows up).

---

## `users`

Identity and authentication only — **no tenant IDs, no roles**. A user is a person, independent of which shop(s) they work at. Tenant relationships live entirely in `tenant_memberships` below.

```sql
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    email               VARCHAR(255) NOT NULL UNIQUE
                            CONSTRAINT users_email_lowercase_check
                            CHECK (email = lower(email)),
    phone               VARCHAR(20),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT users_status_check
                            CHECK (status IN ('active', 'suspended', 'deactivated')),
    password_hash       VARCHAR(255) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_status ON users (status);

CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

### Notes

- **`email`** — same pattern as `tenants.slug`: lowercase enforced by `CHECK`, plain `UNIQUE` (no `CITEXT`), app normalizes before insert. This is the login identifier.
- **`phone`** — optional, not unique. A shared shop phone or a household number can legitimately belong to more than one person; don't force uniqueness the data doesn't have.
- **`status`** — `active` / `suspended` (temporary, e.g. security concern) / `deactivated` (terminal soft-delete, same reasoning as `tenants.archived` — no `deleted_at`, no hard delete). Note this is the person's global account status, independent of any particular tenant relationship — a deactivated user's memberships should be handled separately (see `tenant_memberships.status`), not inferred from this field.
- **`password_hash`** — **decided**: custom auth, no self-serve signup, no forgot-password. A platform admin sets a tenant owner's password directly at creation time (see `platform_admins` and `provision_new_account()` in "Bootstrapping"); an owner sets an invited staff member's password the same way. Always a hash (bcrypt), never plaintext, and the application never logs or returns it. This reverses the earlier "deliberately excluded, deferred to an auth provider" decision below it replaces — Supabase Auth/Clerk were considered and dropped in favor of owning this directly.
- **RLS** — this is the one tenant-owned-elsewhere table with no `tenant_id` column of its own, by design (see above). Its policy is membership-based instead of column-based; see "Row-level security" for the actual `CREATE POLICY` statement. `app_role` has no `INSERT` on this table at all — the only way a row is ever created is the dedicated `SECURITY DEFINER` bootstrap function; see "Bootstrapping" for why account creation needs that and ordinary `SELECT`/`UPDATE` don't.

---

## `platform_admins`

A person who can create new tenants — acting *before and outside* any tenant, which is a genuinely different role from `owner`/`manager`/`cashier` in `tenant_memberships` (those only mean something once a tenant exists). Deliberately not a `users` row: that identity space is scoped to "inside a tenant" (see `users`' own notes), and this role never is.

```sql
CREATE TABLE platform_admins (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    email           VARCHAR(255) NOT NULL UNIQUE
                        CONSTRAINT platform_admins_email_lowercase_check
                        CHECK (email = lower(email)),
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_platform_admins_set_updated_at
    BEFORE UPDATE ON platform_admins
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

GRANT SELECT ON platform_admins TO app_role;
```

### Notes

- **No RLS** — not tenant-owned data, and holds at most a handful of rows.
- **`app_role` gets `SELECT` only — no `INSERT`/`UPDATE`/`DELETE`, ever.** A platform admin account can only be created or rotated by someone with direct database access (see `server/api/src/scripts/hash-password.ts`), never through the live app. This is the same "no self-serve creation" shape `users` already has for its own bootstrap, applied one level higher.
- **Password verification happens in application code, not SQL.** A bcrypt hash can't be compared with plain equality (same input hashed twice produces different output, by design) — the backend reads `password_hash` via the `SELECT` grant above and calls its hashing library's own `compare`, never a SQL `WHERE password_hash = ...`.
- **How this is actually used**: see `provision_new_account()` in "Bootstrapping" — a platform admin's one real action is calling that function to create a tenant, its main store, and its owner (with a password) atomically. Nothing else is exposed to this role.

---

## `stores`

A tenant's physical (or virtual) selling location. Designed before `tenant_memberships` so that store-level access grants have a real foreign key to point at.

```sql
CREATE TABLE stores (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    name                VARCHAR(200) NOT NULL,
    code                VARCHAR(50) NOT NULL
                            CONSTRAINT stores_code_lowercase_check
                            CHECK (code = lower(code) AND code ~ '^[a-z0-9-]+$'),
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT stores_status_check
                            CHECK (status IN ('active', 'suspended', 'archived')),
    timezone            VARCHAR(64),
    currency            CHAR(3),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT stores_tenant_code_unique UNIQUE (tenant_id, code),
    -- lets child tables use a composite FK (tenant_id, store_id) so the DB itself
    -- guarantees a child row and its store belong to the same tenant
    CONSTRAINT stores_tenant_id_id_unique UNIQUE (tenant_id, id)
);

CREATE INDEX idx_stores_tenant_id ON stores (tenant_id);
CREATE INDEX idx_stores_status ON stores (status);

CREATE TRIGGER trg_stores_set_updated_at
    BEFORE UPDATE ON stores
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

### Notes

- **`code`** — a short internal identifier ("main", "branch-2"), unique *per tenant* (not globally, unlike `tenants.slug`) — used in receipts, reports, and staff-facing pickers. Same lowercase discipline as `slug`; not marked immutable here since it's an internal label with a narrower blast radius than a public URL slug, but revisit if it ends up in anything externally addressable.
- **`timezone` / `currency`** — nullable overrides of `tenants.default_timezone` / `default_currency`, for the (currently rare) multi-country or multi-timezone chain. `NULL` means "inherit from tenant" — resolve with `COALESCE(store.timezone, tenant.default_timezone)` at read time rather than copying the value in at store-creation time, so a tenant-level default change propagates to stores that haven't overridden it.
- **`status`** — mirrors the tenant pattern: `active` → `suspended` (temporary, reversible) → `archived` (soft-delete terminal state, no `deleted_at`). A *store* gets this three-value shape, like `tenants`, because it's the thing that can be temporarily paused as a whole operational unit (a billing hold, a renovation, a temporary closure) without being gone — a fact distinct from "permanently shut." Catalogue-level entities one level down (`sellables`, `variants`) don't need a third state for the same situation: their `archived`/`deactivated` is *itself* freely reversible (see "Product/variant lifecycle and the barcode model"), so "pause this" and "bring it back" are already just the same two-value column flipped and flipped back — a `suspended` state would duplicate what `archived ⇄ active` already does for them. `customers`/`suppliers` stay two-valued for a different reason: their `archived` is a genuine terminal soft-delete (see `customers`' notes), and there's no demonstrated Phase 1 need for a "temporarily paused customer/supplier" state distinct from that.
- **RLS** — standard pattern applies here (N-05): policy scoped to `tenant_id` matching the caller's tenant claim; see "Row-level security" for the actual `CREATE POLICY` statement.

---

## `tenant_memberships`

The link between a user and a tenant: which tenant they belong to, and what role they hold there. One row per (user, tenant) pair — never per (user, tenant, store); store-level restriction is a separate concern, see `membership_store_access` below.

```sql
CREATE TABLE tenant_memberships (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    user_id             UUID REFERENCES users (id),
    invited_email       VARCHAR(255)
                            CONSTRAINT tenant_memberships_invited_email_lowercase_check
                            CHECK (invited_email = lower(invited_email)),
    role                VARCHAR(20) NOT NULL
                            CONSTRAINT tenant_memberships_role_check
                            CHECK (role IN ('owner', 'manager', 'cashier')),
    status              VARCHAR(20) NOT NULL DEFAULT 'invited'
                            CONSTRAINT tenant_memberships_status_check
                            CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT tenant_memberships_user_or_invite_check
        CHECK (
            (status = 'invited' AND user_id IS NULL AND invited_email IS NOT NULL)
            OR (status != 'invited' AND user_id IS NOT NULL)
        ),

    -- target for membership_store_access's composite FK
    CONSTRAINT tenant_memberships_tenant_id_id_unique UNIQUE (tenant_id, id)
);

-- one active/invited membership per real user per tenant
CREATE UNIQUE INDEX idx_tenant_memberships_user_tenant_unique
    ON tenant_memberships (tenant_id, user_id)
    WHERE user_id IS NOT NULL;

-- one pending invite per email per tenant
CREATE UNIQUE INDEX idx_tenant_memberships_invite_unique
    ON tenant_memberships (tenant_id, invited_email)
    WHERE user_id IS NULL;

CREATE INDEX idx_tenant_memberships_tenant_id ON tenant_memberships (tenant_id);
CREATE INDEX idx_tenant_memberships_user_id ON tenant_memberships (user_id);

CREATE TRIGGER trg_tenant_memberships_set_updated_at
    BEFORE UPDATE ON tenant_memberships
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

### Notes

- **`user_id` is nullable** to support the invite flow: an owner can invite `cashier@example.com` before that person has ever signed up. The row starts as `status='invited'` with `invited_email` set and `user_id NULL`; on acceptance, the application sets `user_id` and flips `status` to `active` (the `CHECK` constraint enforces that these two facts move together — you can't be `invited` with a `user_id`, or non-`invited` without one).
- **`role`** — three values for now (`owner`, `manager`, `cashier`), matching the operator language in the requirements doc. Kept as a `CHECK` rather than a lookup table for the same reason as `tenants.status` — cheap to extend by migration, no need for a join until roles need to be tenant-customizable.
- **`status`** — `invited` → `active` → `suspended` (temporarily blocked, e.g. staff on leave, reversible) → `removed` (terminal soft-delete, no `deleted_at`, same pattern as everywhere else). A `removed` membership is history, not deleted — useful for "who used to work here" audit trails.
- **No `permissions` JSONB.** Role alone drives authorization for now. If a specific merchant needs a one-off exception, that's a future `membership_overrides` table, not a schema change here.
- **RLS** — scoped to `tenant_id` per N-05, same as every other tenant-owned table; see "Row-level security" for the actual `CREATE POLICY` statement.

### The owner invariant

A hard rule, enforced transactionally, not just documented: **an operating tenant must always have at least one active owner.** A plain `CHECK` can't express this — it can't see other rows — so this is a `CREATE CONSTRAINT TRIGGER` deferred to end-of-transaction.

**Lifecycle:**

| Tenant status | Owner requirement |
|---|---|
| `trial` | ≥ 1 membership with `role='owner'`, `status='active'` |
| `active` | ≥ 1 membership with `role='owner'`, `status='active'` |
| `suspended` | none — an owner may still exist, but nothing enforces it |
| `archived` | none |

**Operations this must block** (whenever they would leave zero active owners on a `trial`/`active` tenant): removing an owner's membership, suspending an owner, changing an owner's role away from `owner`, or suspending/archiving... no — deactivating a tenant's *last* owner is what's guarded; the tenant's own status transition into `trial`/`active` is guarded symmetrically (see the `tenants` trigger below), so a tenant can't be reactivated without an owner already in place either.

```sql
-- shared check: does this tenant, if it needs an owner, have one?
CREATE FUNCTION check_tenant_has_active_owner(p_tenant_id UUID) RETURNS VOID AS $$
DECLARE
    v_tenant_status VARCHAR(20);
    v_owner_count   INT;
BEGIN
    SELECT status INTO v_tenant_status FROM tenants WHERE id = p_tenant_id FOR SHARE;

    -- only trial/active tenants require an owner; suspended/archived do not
    IF v_tenant_status NOT IN ('trial', 'active') THEN
        RETURN;
    END IF;

    SELECT count(*) INTO v_owner_count
    FROM tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND role = 'owner'
      AND status = 'active';

    IF v_owner_count = 0 THEN
        RAISE EXCEPTION
            'tenant % is % and must retain at least one active owner membership',
            p_tenant_id, v_tenant_status;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- guard on tenant_memberships: catches remove / suspend / role-change / delete of an owner
CREATE FUNCTION trg_fn_tenant_memberships_owner_guard() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM check_tenant_has_active_owner(OLD.tenant_id);
        RETURN OLD;
    END IF;

    PERFORM check_tenant_has_active_owner(NEW.tenant_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_tenant_memberships_owner_guard
    AFTER INSERT OR UPDATE OR DELETE ON tenant_memberships
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_tenant_memberships_owner_guard();

-- guard on tenants: catches a tenant moving into trial/active without an owner in place
CREATE FUNCTION trg_fn_tenants_owner_guard() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('trial', 'active')
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        PERFORM check_tenant_has_active_owner(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_tenants_owner_guard
    AFTER INSERT OR UPDATE ON tenants
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_tenants_owner_guard();
```

**Two real bugs found the first time this was actually exercised end to end** (both now fixed above, not just noted):

1. **`check_tenant_has_active_owner()` must be `SECURITY DEFINER`.** The owner-guard triggers are `DEFERRABLE INITIALLY DEFERRED`, so they fire at `COMMIT` — *after* `provision_new_account()` (see "Bootstrapping") has already returned, outside that function's `SECURITY DEFINER` scope. Run as plain `SECURITY INVOKER`, this check executes as `app_role` with no tenant context set (cold start has none, by design), so its own `SELECT count(*) FROM tenant_memberships WHERE tenant_id = ...` gets silently filtered to zero rows by the `tenant_isolation` RLS policy — not because the owner membership wasn't inserted (it was, inside `provision_new_account`'s own elevated scope), but because RLS hides it from this later, context-less check. The invariant then wrongly concludes "no owner" and rolls back a perfectly valid provisioning call. Making this function `SECURITY DEFINER` too (same owner as the tables it reads) fixes it, and is safe: it still only ever returns `VOID` for an already-identified `tenant_id` the caller is already touching, revealing nothing new.
2. **`app_role` needs `UPDATE` privilege to take the `FOR SHARE` lock, not just `SELECT`.** Postgres requires `UPDATE` (not merely `SELECT`) to acquire a row lock via `FOR UPDATE`/`FOR SHARE` — but "The application-role privilege model" deliberately grants `app_role` only `SELECT, INSERT` on `tenants` ("app_role creates new tenants but never edits existing ones"). The fix keeps that intent intact: `GRANT UPDATE (updated_at) ON tenants TO app_role` — a column that is already trigger-only and never written directly by application code, just enough to satisfy the lock-privilege check without opening any real write access to `name`/`slug`/`status`.

**Why deferred, specifically:** because the check runs at `COMMIT` (or at an explicit `SET CONSTRAINTS ... IMMEDIATE`) rather than after each individual statement, an atomic "swap owner" — `UPDATE ... SET role='manager' WHERE id=<old-owner>` then `INSERT ...` a new owner row, both inside one transaction — passes, because only the *final* state at commit is checked. A bare single-statement removal of the last owner (the common accidental case) still fails, because in autocommit mode each statement is its own transaction and the deferred check fires at the end of it. This is the standard Postgres pattern for exactly this shape of invariant — an aggregate condition over sibling rows that a row-level `CHECK` cannot see.

**Required provisioning order, not optional:** a tenant starts `trial`, which this invariant already requires an active owner for — so tenant creation and its first owner membership **must** be created in one transaction, in this order:

1. `INSERT INTO tenants (...)` (`status` defaults to whatever the application sets — typically `trial`), getting back the new `id`.
2. In the same transaction, `INSERT INTO tenant_memberships (tenant_id, user_id, role, status) VALUES (<id from step 1>, <the new owner>, 'owner', 'active')`.
3. `COMMIT`.

`trg_tenants_owner_guard` fires `AFTER INSERT` on `tenants` but is `DEFERRABLE INITIALLY DEFERRED`, so it only actually checks at `COMMIT` (or an explicit `SET CONSTRAINTS ... IMMEDIATE`) — which is exactly what makes step 2 able to follow step 1 as a later statement in the same transaction rather than needing to happen first. A tenant row committed *without* a same-transaction owner membership fails at commit, by construction. That is the invariant doing its job, not a bug to route around — the provisioning/signup flow must be built around this ordering from day one, not discovered by it failing in production. This also means provisioning must always be a single transaction, never two separate round-trips (e.g. "create the tenant" as one request and "add the owner" as a second, later one) — the tenant would be uncommittable in between.

**This ordering is no longer just a rule the application must remember — for a brand-new signup, it's structurally enforced by `provision_new_account()`** (see "Bootstrapping," under "Row-level security"), which performs exactly these two inserts, in exactly this order, inside the one function call `app_role` is permitted to run for cold-start signup. For an already-authenticated user opening an *additional* tenant, the application still issues the two inserts directly (ordinary, RLS-governed statements — see that same section), and must still follow this order and transaction boundary by hand.

---

## `membership_store_access`

Restricts a tenant membership to specific stores. **Absence of rows for a membership means access to all stores in the tenant** — this table only ever narrows, never grants beyond what the membership's tenant already implies.

```sql
CREATE TABLE membership_store_access (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    membership_id       UUID NOT NULL,
    store_id            UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT membership_store_access_unique UNIQUE (membership_id, store_id),

    -- the membership being narrowed: tenant must agree, closing the "membership from
    -- tenant A, store from tenant B" gap a plain FK on membership_id alone couldn't
    CONSTRAINT membership_store_access_membership_fk
        FOREIGN KEY (tenant_id, membership_id)
        REFERENCES tenant_memberships (tenant_id, id),
    -- the store being granted: tenant must agree too — this is what actually makes
    -- a cross-tenant grant impossible, not just a cross-tenant membership reference
    CONSTRAINT membership_store_access_store_fk
        FOREIGN KEY (tenant_id, store_id)
        REFERENCES stores (tenant_id, id)
);

CREATE INDEX idx_membership_store_access_membership ON membership_store_access (tenant_id, membership_id);
CREATE INDEX idx_membership_store_access_store ON membership_store_access (tenant_id, store_id);
```

### Notes

- **No `updated_at`** — rows here are grants, not mutable records; you add or remove a row rather than editing one. No `role_override` column yet either — the design leaves room for one (a manager tenant-wide but only cashier-level at a second store) without needing a migration to add the column when that need actually arrives.
- **`tenant_id` is denormalised onto this table specifically to close a real gap, not just for convention.** The earlier design relied on "application-level responsibility: enforce `stores.tenant_id = tenant_memberships.tenant_id`" — true, but a plain FK on `membership_id` alone (referencing just `tenant_memberships.id`) can't express "and the referenced membership's tenant must equal the referenced store's tenant" across two unrelated columns. With `tenant_id` now a real column here, both `membership_store_access_membership_fk` and `membership_store_access_store_fk` independently require their target to match *this row's* `tenant_id` — so a membership from tenant A can never be paired with a store from tenant B: either FK would have no matching row to satisfy, and the insert fails outright. This also gives the table a normal column to apply the standard tenant-isolation RLS policy to (see "Row-level security") — before this change it had no direct tenant_id at all.
- Owners and managers with tenant-wide access simply have zero rows here. This keeps the common case (a single-store shop, one owner, maybe one cashier) free of any rows in this table at all.

---

## Row-level security

N-05 names RLS as "the safety net, not the mechanism" — the application is still expected to scope every query by tenant, and RLS exists to catch it if that ever fails. Until now, every table's own notes asserted that a policy exists ("RLS scoped to `tenant_id` per N-05") without the policy itself ever being written down. This section is that policy, made real: the actual tenant-context mechanism, and the actual `CREATE POLICY` statements, in one place, rather than a claim repeated per table.

### The tenant-context mechanism

Two session-local settings, both set by the application **once per request/transaction**, after it has independently verified the caller's signed JWT (per N-05 — RLS never substitutes for that verification, it only trusts what the application already validated):

```sql
-- set once, at the start of every request's transaction, by the application —
-- never by anything a caller can influence directly
SELECT set_config('app.current_tenant_id', '<tenant-uuid-from-verified-jwt-claim>', true);
SELECT set_config('app.current_user_id',   '<user-uuid-from-verified-jwt-claim>',   true);
```

`set_config(..., true)` sets it `LOCAL` — scoped to the current transaction, automatically cleared at `COMMIT`/`ROLLBACK`, so a pooled connection can never leak one request's tenant context into the next request that reuses it. Every policy below reads these back with `current_setting(name, true)` — the second argument makes a missing setting return `NULL` rather than raise an error, and every policy is written so that a `NULL` tenant/user context satisfies *no* row, ever (comparing anything to `NULL` is `NULL`, which `USING`/`WITH CHECK` both treat as "deny"). **An unset context is a closed door, not an open one** — this is the one property that must never regress, so it's stated here explicitly rather than left to be inferred from reading every policy.

```sql
-- the exact two expressions every policy below is built from
CREATE FUNCTION app_current_tenant_id() RETURNS UUID AS $$
    SELECT current_setting('app.current_tenant_id', true)::UUID;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION app_current_user_id() RETURNS UUID AS $$
    SELECT current_setting('app.current_user_id', true)::UUID;
$$ LANGUAGE sql STABLE;
```

These two functions exist purely so the 22 policies below read `app_current_tenant_id()` instead of repeating the `current_setting(...)::UUID` cast 22 times — they carry no logic of their own beyond that, and `STABLE` (not `VOLATILE`) lets the planner call each once per statement rather than once per row.

### The standard policy, applied to every tenant-owned table

Every table below has an explicit `tenant_id` column (this is exactly what N-05's "tenant_id everywhere" bought). Each gets the identical pattern: enable RLS, then one policy covering every command, using the same expression for both the row-visibility check (`USING`, which also governs `UPDATE`/`DELETE`) and the row-write check (`WITH CHECK`, which governs `INSERT` and the new values of an `UPDATE`) — a row is visible, and a row can only ever be written, inside the caller's own tenant:

```sql
ALTER TABLE stores                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_store_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellables               ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants                ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_item_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_returns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_ledger  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON stores
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON tenant_memberships
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON membership_store_access
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON suppliers
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON sellables
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON variants
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON purchases
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON purchase_items
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON inventory_batches
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON stock_movements
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON purchase_returns
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON purchase_return_items
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON customers
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON payment_methods
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON payment_accounts
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON sales
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON sale_items
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON sale_item_batches
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON sale_returns
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON sale_return_items
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON sale_payments
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
CREATE POLICY tenant_isolation ON customer_credit_ledger
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());
```

That's every table this document defines that carries a direct `tenant_id` column — the same 22 tables section 2 of the audit asked about, `membership_store_access` now included now that it has one (see that table's notes).

### The two tables without a direct `tenant_id`

**`tenants`** is deliberately excluded from the list above — it isn't tenant-*owned*, it *is* the tenant, so "restrict to the caller's tenant" is a meaningless policy on this one table (see its own notes: access here is a platform-admin concern, "decided when the auth model is designed," unchanged by this pass). No policy is added here; this is a gap left open on purpose, not an oversight.

**`users`** has no `tenant_id` at all, by design (see that table's notes — identity is tenant-independent, since one person can belong to several tenants). Its policy can't compare a column to `app_current_tenant_id()`; instead, a `users` row is visible exactly when the current tenant context has a membership linking to it — the same relationship the application already walks to enforce this today, just made a backstop instead of a convention:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_membership_or_self ON users
    USING (
        id = app_current_user_id()
        OR EXISTS (
            SELECT 1 FROM tenant_memberships tm
             WHERE tm.user_id = users.id
               AND tm.tenant_id = app_current_tenant_id()
        )
    );
```

`id = app_current_user_id()` is there so a caller can always read their own account row regardless of which (or whether any) tenant context is active — needed for account-level screens that aren't scoped to one tenant. There is deliberately **no `WITH CHECK`** on this policy: `users` rows are written through account management (signup, profile edits), not through tenant-scoped business transactions, and the shape of that write path — in particular, **creating** a new `users` row for someone who by definition has no membership yet and no session of their own yet — is an auth-system/signup concern outside this schema's scope, the same way password hashes and the credential store are (see `users`' own notes). Whatever that path turns out to be (a `SECURITY DEFINER` signup function, a backend role with `BYPASSRLS`, or similar), it is explicitly **not resolved by this schema** — flagging that plainly rather than writing a `WITH CHECK` that would just be guessing at a mechanism nobody asked for.

### How this enforces isolation, concretely

- **A missing or wrong tenant context denies everything**, not just the tables it happens to touch: since every policy's `USING`/`WITH CHECK` compares a real column to `app_current_tenant_id()`, and that function returns `NULL` when the session setting was never set, *zero* rows satisfy the policy anywhere. A connection that forgets to call `set_config('app.current_tenant_id', ...)` sees an empty database, not another tenant's data and not its own — fully closed, not fully open.
- **Composite tenant FKs (already in place throughout this document) and RLS are two different layers, not duplicates.** The FKs stop a row from being *inserted* pointing at another tenant's parent, regardless of who's connected. RLS stops a row from being *read or written at all* by a session whose context doesn't match, regardless of what the row points at. A query that forgets a `WHERE tenant_id = $1` clause is exactly the failure RLS exists to catch — the FK layer alone never would, since it only ever constrains relationships between rows, never which rows a `SELECT` returns.
- **No policy here ever compares two different tenants' data to each other, and no policy references another tenant's `app_current_tenant_id()` value** (there's only ever one, per session) — so there's no path by which one tenant's policy evaluation can expose a condition derived from a different tenant's rows.
- **`FORCE ROW LEVEL SECURITY` is not included above, and that's an operational decision the deploying role must get right, not a gap in the policies themselves.** By default, Postgres RLS policies don't apply to a table's *owner* — only to other roles. If the application connects as the table owner, every policy above is silently bypassed. The correct setup (and the one every `REVOKE` note elsewhere in this document already assumes) is for the application to connect as a separate, non-owning role — concretely named and defined in "The application-role privilege model," next — which gets these policies enforced automatically with no `FORCE` needed; `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is the fallback only if the application must, for some other reason, connect as the owning role.

### The application-role privilege model

Every `REVOKE`/`GRANT` note elsewhere in this document (`inventory_batches.available_quantity`, `stock_movements`, `customer_credit_ledger`) has, until now, referred to an unnamed `<app_role>` in prose. This section names and defines it concretely, so "the application role" means one specific, fully-specified thing everywhere it's mentioned.

**Two roles, not one:**

```sql
-- owns every table, function and trigger in this schema. Used ONLY to run migrations
-- (CREATE TABLE/FUNCTION/TRIGGER/INDEX, and the one bootstrap function below) — never
-- for live application traffic. RLS does not apply to a table's owner by default, which
-- is exactly why this role must never be the one live requests connect as.
CREATE ROLE app_owner NOLOGIN;

-- the role the application connects as for every live request, after a request's JWT
-- has already been verified (see "Row-level security"). Ordinary login role, no special
-- attributes (NOT a superuser, NOT BYPASSRLS, does not own anything) — RLS and the
-- column/table grants below are its entire access boundary.
CREATE ROLE app_role LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;

GRANT USAGE ON SCHEMA public TO app_role;
```

`app_owner` is deliberately `NOLOGIN` — nothing ever connects as it directly over the network; a deployment's migration runner authenticates as it (or a superuser runs migrations once and then `ALTER TABLE ... OWNER TO app_owner`), and it is the function owner for the one `SECURITY DEFINER` function this schema needs (see "Bootstrapping," next). Every `CREATE TABLE` in this document is assumed owned by `app_owner`.

**Per-table grants for `app_role`**, grouped by the identical privilege set each group shares — this is the first time these have been written as real DDL rather than asserted:

```sql
-- Group 1: ordinary tenant-owned headers/catalogue/config rows. Content and status
-- columns change in place (e.g. a status transition, a price edit); nothing in this
-- group is ever hard-deleted by the application — each uses a soft-delete/terminal
-- status instead (see each table's own notes) — so DELETE is deliberately not granted.
GRANT SELECT, INSERT, UPDATE ON
    stores, tenant_memberships, suppliers, sellables, variants, customers,
    payment_methods, payment_accounts, purchases, purchase_returns, sales, sale_returns
    TO app_role;

-- Group 2: draft-mutable line items. Each of these is real-DELETE-able, but only while
-- draft — that business rule is already enforced by each table's own
-- require-draft-parent trigger (e.g. sale_items_require_draft_sale); the grant below is
-- the privilege-level precondition those triggers assume, not a replacement for them.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    purchase_items, purchase_return_items, sale_items, sale_item_batches,
    sale_return_items, sale_payments
    TO app_role;

-- Group 3: membership_store_access has no content column and no status column at all —
-- "you add or remove a row rather than editing one" (see its own notes) — so it gets
-- real DELETE instead of UPDATE.
GRANT SELECT, INSERT, DELETE ON membership_store_access TO app_role;

-- Group 4: append-only or otherwise write-once tables. No UPDATE, no DELETE, for four
-- different reasons landing on the same privilege shape:
--   tenants              — status transitions (suspend/archive) are a platform-admin
--                           operation, not yet built (see that table's own RLS note);
--                           app_role creates new tenants but never edits existing ones.
--                           The one exception is below: UPDATE on just `updated_at`,
--                           needed only to take the row lock check_tenant_has_active_owner()
--                           uses — not a real write path (see "The owner invariant").
--   inventory_batches    — immutable in every column except available_quantity (and
--                           updated_at), and even those two are trigger-only; app_role
--                           has no legitimate direct UPDATE here at all (see below).
--   stock_movements      — append-only ledger (trg_stock_movements_append_only).
--   customer_credit_ledger — append-only ledger (trg_customer_credit_ledger_append_only).
GRANT SELECT, INSERT ON tenants, inventory_batches, stock_movements, customer_credit_ledger TO app_role;

-- explicit, redundant-but-intentional belt-and-suspenders: app_role was never granted
-- table-wide UPDATE on these three above, so this changes nothing functionally — it
-- exists so "app_role cannot modify available_quantity / cannot update or delete the
-- ledgers" is a literal, greppable statement in the deployment script, not just an
-- absence someone has to notice.
REVOKE UPDATE (available_quantity) ON inventory_batches FROM app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON stock_movements FROM app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON customer_credit_ledger FROM app_role;

-- see "The owner invariant": Postgres requires UPDATE (not just SELECT) to take
-- a FOR SHARE row lock, which check_tenant_has_active_owner() does on tenants.
-- Grant it on exactly one trigger-only column, never a real content column.
GRANT UPDATE (updated_at) ON tenants TO app_role;

-- users: no INSERT at all (see "Bootstrapping" — the only way a users row is ever
-- created is the dedicated SECURITY DEFINER function, never a direct app_role insert).
-- SELECT/UPDATE are governed by the tenant_membership_or_self policy from "Row-level
-- security" — an UPDATE is only visible/writable for your own row or a fellow member of
-- your current tenant, same as a SELECT would be.
GRANT SELECT, UPDATE ON users TO app_role;

-- platform_admins: SELECT only, for the login check (see that table's own notes) -
-- never INSERT/UPDATE/DELETE, so an admin account can only be created or rotated
-- with direct database access, never through the live app.
GRANT SELECT ON platform_admins TO app_role;
```

**Why `inventory_batches` needs no `UPDATE` grant at all, not even a column-restricted one.** `trg_inventory_batches_prevent_core_change` already blocks every column except `available_quantity`/`updated_at` from changing by application-level content rules; between those two, `available_quantity` must only ever move via the ledger and `updated_at` is trigger-set. There is, in other words, no column on this table app_role has any legitimate reason to `UPDATE` directly — so the grant is withheld entirely, and the explicit column-level `REVOKE` above is pure documentation of intent, not load-bearing on its own.

**This does not break `trg_fn_stock_movements_apply_to_batch`, or any other trigger that fires as a side effect.** A `SECURITY DEFINER` function executes its entire body — including every statement inside it, and every trigger those statements go on to fire — as its *owner* (`app_owner`), not as whichever role called it. When `trg_fn_stock_movements_apply_to_batch` runs its own `UPDATE inventory_batches SET available_quantity = ...` (fired by app_role's `INSERT` into `stock_movements`, which app_role *does* have), that `UPDATE` — and everything it cascades into, including `trg_inventory_batches_set_updated_at` and `trg_inventory_batches_prevent_core_change` — executes under `app_owner`'s privileges, which owns the table and so is never blocked by app_role's own (lack of) grants. This is exactly the mechanism the pre-existing `SECURITY DEFINER` note already relied on ("an invoker-rights version of this function would fail too, taking the whole insert down with it") — this section just makes the role names and grants concrete enough to confirm it actually works end to end, rather than leaving `<app_role>` and its privileges unspecified.

**`SECURITY DEFINER` functions and `search_path`.** `trg_fn_stock_movements_apply_to_batch` already declares `SET search_path = pg_catalog, public` — the standard hardening that stops a `SECURITY DEFINER` function from being tricked into resolving an unqualified identifier against a schema an attacker controls. The one new `SECURITY DEFINER` function this pass adds (`provision_new_account`, next section) carries the identical `SET search_path = pg_catalog, public`. No other function in this document runs as `SECURITY DEFINER`; every other function, including the RLS helpers `app_current_tenant_id()`/`app_current_user_id()`, is plain `SECURITY INVOKER` (the default) and executes as whichever role calls it, with that role's own RLS and grants fully in effect.

**This privilege model doesn't, and can't, bypass RLS on its own.** `app_role` is granted no attribute (`BYPASSRLS`, superuser, or table ownership) that would exempt it from the policies in "Row-level security" — every `SELECT`/`INSERT`/`UPDATE`/`DELETE` above is still filtered by the matching `tenant_isolation` policy (or `tenant_membership_or_self`, for `users`) on top of whatever table-level grant it has. The grants above say *what kind of statement* app_role may issue against a table; RLS separately says *which rows* that statement can see or touch. Both layers have to agree before anything happens — narrowing one is meaningless without the other, which is why this section exists alongside "Row-level security" rather than instead of it.

### Bootstrapping: the first user, tenant and owner membership

Every policy in "Row-level security" assumes a tenant and/or user context already exists. Signing up — creating the very first `users` row for a person, and the very first `tenants` row with its required owner `tenant_memberships` row — is, by definition, the one moment neither exists yet. This section is the resolution for that gap, which the RLS section explicitly left open.

**Two bootstrap shapes, not one, because they're genuinely different problems:**

1. **Cold start — a person with no `users` row yet, creating their first tenant.** No session, no JWT, nothing to set `app.current_user_id`/`app.current_tenant_id` to. This is the hard case, and the one that needs a privileged escape hatch.
2. **An already-authenticated person creating an *additional* tenant** (a second shop under a different business entity, say). Their `users` row and a valid `app.current_user_id` already exist — they're just missing a tenant context for a tenant that doesn't exist *yet either*. This case needs no escape hatch at all, because `tenants` already carries no RLS policy (see "Row-level security") and the application can simply switch `app.current_tenant_id` to the newly created tenant's id, in the same transaction, immediately after creating it — then the ordinary `tenant_isolation` policy on `tenant_memberships` is satisfied normally for inserting the new owner row. No new mechanism is defined for this case because none is needed; it's listed here only so it isn't mistaken for the harder case.

**Cold start is handled by one narrowly-scoped `SECURITY DEFINER` function — not by granting `app_role` any broader bypass:**

**Who may call this at all is an application-layer decision, not a database one.** Nothing in Postgres's grants can distinguish "this `app_role` connection is the platform admin" from "this `app_role` connection is a cashier" — every live request connects as the exact same database role. The database's job is only "can this function create an island safely if called"; "is the caller actually allowed to call it" is enforced one layer up, by `server/api`'s own platform-admin check (HTTP Basic Auth against `platform_admins`, verified before this function is ever reached — see `server/api/src/auth/platform-admin.ts`).

```sql
-- the ONE deliberate, narrow exception to "app_role never bypasses RLS." Runs as
-- app_owner (its definer), which — as the owner of users/tenants/stores/
-- tenant_memberships — is exempt from RLS on them, for exactly the four inserts
-- below and nothing else. It is not a general-purpose escape hatch: it takes no
-- caller-supplied tenant_id or user_id to attach new rows to an EXISTING tenant,
-- it only ever creates a brand-new user, a brand-new tenant, its main store, and
-- the one membership tying them together — and it hands back only the ids it
-- just created. There is no code path through this function that can read or
-- write a tenant that already exists.
CREATE FUNCTION provision_new_account(
    p_email         VARCHAR(255),
    p_password_hash VARCHAR(255),
    p_first_name    VARCHAR(100),
    p_last_name     VARCHAR(100),
    p_tenant_name   VARCHAR(200),
    p_tenant_slug   VARCHAR(100),
    p_store_name    VARCHAR(200),
    p_store_code    VARCHAR(50)
) RETURNS TABLE (user_id UUID, tenant_id UUID, store_id UUID, membership_id UUID) AS $$
DECLARE
    v_user_id       UUID;
    v_tenant_id     UUID;
    v_store_id      UUID;
    v_membership_id UUID;
BEGIN
    INSERT INTO users (email, password_hash, first_name, last_name)
    VALUES (lower(p_email), p_password_hash, p_first_name, p_last_name)
    RETURNING id INTO v_user_id;

    -- status is 'trial' here, which is exactly what requires an active owner — see the
    -- tenant_memberships insert below, and "Required provisioning order" under
    -- tenant_memberships
    INSERT INTO tenants (name, slug, status)
    VALUES (p_tenant_name, p_tenant_slug, 'trial')
    RETURNING id INTO v_tenant_id;

    INSERT INTO stores (tenant_id, name, code)
    VALUES (v_tenant_id, p_store_name, p_store_code)
    RETURNING id INTO v_store_id;

    INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
    VALUES (v_tenant_id, v_user_id, 'owner', 'active')
    RETURNING id INTO v_membership_id;

    RETURN QUERY SELECT v_user_id, v_tenant_id, v_store_id, v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION provision_new_account(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_new_account(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO app_role;
```

**Why this doesn't weaken tenant isolation.** `app_role` is granted `EXECUTE` on this *one* function, not `INSERT` on `users`/`tenants`/`stores`/`tenant_memberships` directly (the privilege model above grants `app_role` no `INSERT` on `users` at all, and only a plain, RLS-governed `INSERT` on `tenants`/`tenant_memberships` for case 2 above). The function's own body is the entire bypass surface, and it is fixed, reviewable code with no caller-supplied id that could redirect it at an existing tenant — a caller can make it create a new island, never touch an existing one. Calling it twice creates two unrelated tenants, never adds a second owner to the first.

**No self-serve signup and no forgot-password — decided.** `p_password_hash` is supplied by the caller (the platform admin's own request, for the tenant's owner; an owner's own request, for an invited staff member's first password), hashed before this function is ever called — never a plaintext password typed by the new user themselves on a public signup page. There is no password-reset flow built or planned; a forgotten password is reset by whoever is allowed to set one in the first place (the platform admin for an owner, an owner/manager for their own staff).

**When session context becomes available.** There is none during the call itself — that's the whole reason this function exists. Immediately after it returns, the application's authentication layer mints the real session for the new `user_id` by checking the owner's email/password directly against `users.password_hash`, and every request from that point on carries `tenant_id`/`user_id` as verified claims, populating `app.current_tenant_id`/`app.current_user_id` exactly as "Row-level security" describes for any other authenticated request. Nothing about steady-state request handling is special-cased for a freshly-provisioned account.

**Atomicity and the owner invariant.** All four inserts run inside the one statement that calls this function; if any of them fails (a duplicate email, a duplicate slug), the whole call rolls back and nothing is left half-created. `trg_tenants_owner_guard`'s deferred check — which requires an active owner before a `trial`/`active` tenant's *outer* transaction can commit — sees the owner membership already inserted by the time it runs, satisfying "Required provisioning order" automatically as long as the caller wraps this single function call in its own transaction (or lets it run as the implicit single-statement transaction it already is). See "The owner invariant" above for the two real bugs this exposed the first time it was actually called, and their fixes.

**The same pattern extends to invite acceptance, not built out further here.** Accepting a `tenant_memberships` invite (`status='invited'`, `user_id IS NULL`) has an identical cold-start shape — the invited person has no `users` row and no session either — so it needs its own, equally narrow `SECURITY DEFINER` function (create the `users` row, then update the *one* specific, already-`invited` membership row a validated invite token names, nothing else reachable). It is not specified in full here because it wasn't part of the flow this pass was asked to resolve, but any implementation must follow this exact template — one function, one narrow job, no caller-supplied access to anything pre-existing beyond the single row an out-of-band-verified token already identifies — rather than widening `provision_new_account` or granting `app_role` any broader insert/update privilege to cover it.

---

## Phase 1: catalogue, purchasing and inventory

Scope is deliberately small: **one operational store uses stock at this stage.** Every table is still tenant- and store-aware so multi-store can be added later. Out of scope for Phase 1: catalogue sharing between stores, store-to-store transfers, `store_sellables`, `store_variants`, store-level pricing, and individual-unit (serial) tracking.

**Schema capability vs. Phase 1 workflow** is a distinction worth naming up front, because it recurs below: the schema deliberately allows things — multiple batches per purchase item, partial receiving — that the Phase 1 *user-facing workflow* does not expose as a feature. That is not scope creep; it is the opposite of it. A narrower schema that only fit today's simple one-item-one-batch receiving flow would need a migration the day multi-batch receiving becomes a real feature, and every table downstream of it (batches, movements, returns) would need to be re-validated against the new shape. Building the room in now, and simply not building UI for it yet, avoids that. Where this applies, it's called out explicitly in that table's notes rather than left implicit.

```text
Tenant
  └── Store
        ├── Sellables (ACTIVE / ARCHIVED — reversible)
        │     └── Variants (ACTIVE / DEACTIVATED — reversible) ──► base_price
        ├── Purchases (also belong to a Supplier)
        │     ├── Purchase Items ──► Variant
        │     └── Purchase Returns ──► Purchase
        │           └── Purchase Return Items ──► Purchase Item, Inventory Batch
        └── Inventory Batches ──► Variant, and EITHER Purchase Item OR Sale Return Item
              └── Stock Movements (append-only ledger)
```

```text
Purchase → Purchase Item → Variant
                 └── Inventory Batch(es) ← Stock Movements

Purchase ──► Purchase Return (draft → completed → reversed)
                    └── Purchase Return Item ──► Purchase Item, Inventory Batch
                              ├── on completion:  PURCHASE_RETURN stock movement
                              └── on reversal:    PURCHASE_RETURN_REVERSAL stock movement
```

**Conventions used by every table below**

- `tenant_id` is an explicit column on every table, for RLS (N-05), composite foreign keys and tenant-scoped uniqueness. Tenant isolation is not left to a join through `stores`.
- Each parent exposes a `UNIQUE (tenant_id, ...)` key, and each child references `(tenant_id, parent_id)`. The database therefore rejects any row that points at another tenant's parent.
- Soft-delete via `status`, no `deleted_at`, as elsewhere — though not always the *terminal* shape: `purchases`/`purchase_returns` use an edge-by-edge state machine (see their own guards), while `sellables.status`/`variants.status` are freely reversible catalogue toggles, not one-way (see "Product/variant lifecycle and the barcode model"). The remaining exceptions are draft purchase lines and draft return lines (working data, deletable while their parent purchase/return is still open), `stock_movements` (never deleted, never updated), and `inventory_batches` (no `status` column at all — see its notes).
- Money is `NUMERIC(12,2)` per unit and `NUMERIC(14,2)` for totals. **All quantities are `INTEGER`** — `purchase_items.quantity`, `inventory_batches.received_quantity`/`available_quantity`, and `stock_movements.quantity` — because Phase 1 does not support fractional or weighed goods. If that need arrives, it gets a proper unit-of-measure model designed for it, not a quiet widening of these columns to `NUMERIC`. Amounts are in the store's currency (`COALESCE(stores.currency, tenants.default_currency)`).

---

## `suppliers`

Who the tenant buys from. Tenant-level: one supplier can serve any store. This is not catalogue sharing.

```sql
CREATE TABLE suppliers (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    name                VARCHAR(200) NOT NULL,
    phone               VARCHAR(20),
    email               VARCHAR(255)
                            CONSTRAINT suppliers_email_lowercase_check
                            CHECK (email = lower(email)),
    tax_id              VARCHAR(50),
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT suppliers_status_check
                            CHECK (status IN ('active', 'archived')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT suppliers_tenant_id_id_unique UNIQUE (tenant_id, id)
);

CREATE TRIGGER trg_suppliers_set_updated_at
    BEFORE UPDATE ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

- `tax_id` holds the supplier's GSTIN (or local equivalent) for input-tax records. Name is not unique, since two real suppliers can share a name.
- Supplier payables (what we owe them) are a separate credit-ledger concern (F-26), not columns here.

---

## `sellables`

The conceptual thing the business can sell: "Silk Saree", "Haircut". It is created within a store (**`stores 1:N sellables`**). It has no price and no stock: those live on variants and batches.

```sql
CREATE TABLE sellables (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    kind                VARCHAR(20) NOT NULL
                            CONSTRAINT sellables_kind_check
                            CHECK (kind IN ('product', 'service')),
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT sellables_status_check
                            CHECK (status IN ('active', 'archived')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sellables_tenant_id_id_unique UNIQUE (tenant_id, id),
    -- target for variants: keeps a variant in the same tenant AND store as its sellable
    CONSTRAINT sellables_tenant_store_id_unique UNIQUE (tenant_id, store_id, id),
    CONSTRAINT sellables_store_fk
        FOREIGN KEY (tenant_id, store_id) REFERENCES stores (tenant_id, id)
);

CREATE INDEX idx_sellables_store ON sellables (tenant_id, store_id);
-- lifecycle filtering: catalogue browsing filters on exactly this triple
CREATE INDEX idx_sellables_store_status ON sellables (tenant_id, store_id, status);

CREATE TRIGGER trg_sellables_set_updated_at
    BEFORE UPDATE ON sellables
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- where a sellable lives and what kind it is never change: stock and purchases depend on both
CREATE FUNCTION sellables_prevent_identity_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.kind <> OLD.kind THEN
        RAISE EXCEPTION 'sellables tenant_id, store_id and kind are immutable (sellable %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sellables_prevent_identity_change
    BEFORE UPDATE ON sellables
    FOR EACH ROW
    EXECUTE FUNCTION sellables_prevent_identity_change();
```

- **`kind`** (`product` / `service`) is only a **coarse discriminator**: it says whether stock can exist at all. It does **not** replace the capability/facet model from F-01 (Stocked, Weighed, Made, Configured, Routed, Timed). Those arrive later as optional 1:1 child tables keyed on the sellable or variant, and a sellable's capabilities are decided by which facet rows exist, not by `kind`. Adding F&B later (recipes, modifiers, kitchen routing) adds tables; it does not change this one.
- **`kind` is immutable.** Flipping a product to a service after it has purchases and stock would orphan its inventory.
- **`status`: `active` / `archived`, a freely reversible catalogue toggle** — same shape as `variants.status` (no transition-guard trigger, either value settable at any time) and, like that column, it never deletes anything: the sellable row, its variants, and all existing inventory stay exactly as they were. `archived` means *this sellable's variants cannot be selected for a new `sale_items` line*, full stop — not "delete," not "hide the history." Archiving a sellable **does not cascade a status change to its variants**: a variant can stay `active` on its own row while its parent sellable is `archived`, and no trigger here rewrites it. That's deliberate, not an oversight — see the next bullet for why it still can't be sold.
- **Sellable-archived and variant-deactivated combine with `AND`, not `OR`-of-convenience.** A variant is sellable in a new sale only when **both** `sellables.status = 'active'` **and** `variants.status = 'active'` — enforced by one join-based trigger on `sale_items` (see that table), since a `CHECK` constraint can't span two tables. Archiving the parent is enough to block every one of its variants from new sales immediately, without touching a single variant row; reactivating the sellable alone is enough to make an already-`active` variant sellable again, with no bulk-update needed either way.
- **`store_id`** is where the sellable was created and, in Phase 1, the only store that sells it. When sharing arrives it becomes the provenance column `source_store_id`, alongside a link table. That migration is the price of deferring sharing.
- Every sellable needs at least one variant, even simple ones (a "Standard" variant for a haircut). This is an application rule and is not enforced by the database yet.

---

## `variants`

A specific version of a sellable, and **the level that is stocked, priced and sold** (**`sellables 1:N variants`**). Example: `Silk Saree → Red/6m, Blue/6m, Green/6m`. **This is also the level the product-creation UX is built around** — a variant carries its own name, SKU and selling price; the sellable itself never asks for a price (see notes).

```sql
CREATE TABLE variants (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    sellable_id         UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    sku                 VARCHAR(64),
    -- SELLING price charged to customers. Never a purchase cost.
    base_price          NUMERIC(12,2) NOT NULL
                            CONSTRAINT variants_base_price_check CHECK (base_price >= 0),
    -- 'deactivated', not 'archived': a lighter, explicitly reversible toggle — see notes
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT variants_status_check
                            CHECK (status IN ('active', 'deactivated')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT variants_tenant_id_id_unique UNIQUE (tenant_id, id),
    -- target for inventory_batches: keeps a batch in the same tenant AND store as its variant
    CONSTRAINT variants_tenant_store_id_unique UNIQUE (tenant_id, store_id, id),
    -- tenant AND store must match the parent sellable — a variant cannot silently drift to
    -- another store's sellable, even though store_id is stored again here for speed
    CONSTRAINT variants_sellable_fk
        FOREIGN KEY (tenant_id, store_id, sellable_id)
        REFERENCES sellables (tenant_id, store_id, id)
);

-- SKU is optional (the system can fill it in later, per "never block a sale"),
-- but unique per tenant when present
CREATE UNIQUE INDEX idx_variants_tenant_sku_unique
    ON variants (tenant_id, sku)
    WHERE sku IS NOT NULL;

CREATE INDEX idx_variants_sellable ON variants (tenant_id, sellable_id);
CREATE INDEX idx_variants_store ON variants (tenant_id, store_id);
-- active-variant lookup: catalogue browsing and the sales-eligibility check (see sale_items)
-- both filter on exactly this triple
CREATE INDEX idx_variants_store_status ON variants (tenant_id, store_id, status);

CREATE TRIGGER trg_variants_set_updated_at
    BEFORE UPDATE ON variants
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION variants_prevent_parent_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.sellable_id <> OLD.sellable_id THEN
        RAISE EXCEPTION 'variants tenant_id, store_id and sellable_id are immutable (variant %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variants_prevent_parent_change
    BEFORE UPDATE ON variants
    FOR EACH ROW
    EXECUTE FUNCTION variants_prevent_parent_change();
```

- **`status`: `active` / `deactivated`, a freely reversible catalogue toggle** — there is no status-transition guard trigger on this table (unlike `sales`/`purchases`' edge-by-edge lifecycles), so either value can be set at any time; a variant that's restocked or brought back into season is simply flipped back to `active`. `deactivated` means exactly one thing: *this variant cannot be selected for a new `sale_items` line* (enforced by `sale_items`' eligibility trigger — see that table). It does **not** touch inventory: existing `inventory_batches` rows, their `available_quantity`, and every historical `sale_items`/`stock_movements` row referencing this variant are completely unaffected — no `stock_movements` row is ever posted merely because a variant was deactivated, and nothing here deletes the variant or its batches. Deactivated stock stays queryable and auditable; it's just not sellable through the normal sales workflow until reactivated. Future workflows (clearance, offers, manual adjustment, disposal) can consume that same stock without any schema change here.
- **`base_price` is the selling price and lives on the variant**, because Red/6m and a plain 3m variant can be priced differently. It is the master selling price for Phase 1; a later store-level override would sit on top of it without changing this column — see "Future pricing compatibility" below.
- **Variant-first commercial UX.** A variant is created with its own name, SKU, attributes and `base_price` — the sellable is the umbrella grouping ("Silk Saree") and is never asked for a price. `Red/6m → ₹2,000`, `Blue/6m → ₹2,300`, `Green/6m → ₹1,900` are three variant rows under one sellable, each independently priced.
- **`name`** is the human label ("Red / 6m") and today doubles as where free-text "attributes" (colour, size, etc.) live. Structured option axes as their own columns are a future `variant_options` design using real tables, not a JSONB blob — that decision is unchanged by variant-first UX; the UX is about *where the user enters the data*, not about how it is normalised in the schema.
- **`sku`** is unique per tenant. Manufacturer barcodes (EAN) are a separate future `variant_barcodes` table; the barcode on `inventory_batches` is something else (see the comparison table below).
- **`store_id` is denormalised from the sellable, on purpose** — same pattern as `purchase_items.store_id`. It exists so `inventory_batches` (and any future table hanging off a variant) can enforce tenant/store consistency with a direct composite FK, instead of only transitively through a join to `sellables`. The composite `variants_sellable_fk` still ties `store_id` to the parent sellable's own store, so the two can never disagree — this is not a second, independently-editable store assignment.

---

## Product/variant lifecycle and the barcode model

This section locks two things that were previously implicit: how `sellables` and `variants` move between sellable and not-sellable, and how a barcode identifies stock. No new tables — every piece named here (`sellables.status`, `variants.status`, `sale_items`' eligibility trigger, `inventory_batches.barcode`/origin columns) already exists from this phase and the sale-returns phase before it. This section is the one place that states how they fit together as a single model.

```text
Sellable/Product ──► Variant ──► Inventory Batch ──► Barcode
  (ACTIVE/ARCHIVED)    (ACTIVE/DEACTIVATED)  (purchase- or return-origin)  (own value per batch)
```

### Lifecycle: two independent switches, combined with AND

| | States | Reversible? | What it blocks | What it never touches |
|---|---|---|---|---|
| `sellables.status` | `active` / `archived` | Yes — plain column, no transition guard | Every variant under an archived sellable, for new sales — *without* rewriting any variant row | The sellable row, its variants, their inventory, all history |
| `variants.status` | `active` / `deactivated` | Yes — plain column, no transition guard | Just that one variant, for new sales | Its `inventory_batches` rows, `available_quantity`, all history |

A variant is eligible for a **new** `sale_items` line only when **both** are true at once — `sellables.status = 'active'` **and** `variants.status = 'active'` — checked by `trg_sale_items_require_active_variant` (see `sale_items`). Archiving the sellable is enough on its own to block every one of its variants; no cascading `UPDATE` ever touches `variants.status`, and none of this is enforceable as a single-table `CHECK` since the two columns live on different tables.

Neither switch ever produces a `stock_movements` row, ever changes `available_quantity`, and ever deletes anything. `inventory_batches` has no FK to, or trigger dependency on, either status column — an archived/deactivated variant's stock is exactly as present, and exactly as queryable, the moment after the flip as the moment before. Reactivating either is just flipping the column back; nothing needs "repair."

### Barcode: identifies a batch, never just a variant

```text
Barcode ──► Inventory Batch ──► Variant ──► Sellable
```

A barcode is looked up as `(tenant_id, barcode)` against `inventory_batches` — the unique, tenant-scoped index (`inventory_batches_tenant_barcode_unique`, from the catalogue/inventory phase) is the entire mechanism, and it applies identically to both batch origins introduced in the sale-returns phase:

- **Purchase-origin** (`purchase_item_id NOT NULL`, `sale_return_item_id NULL`): receives its barcode when the batch is created at receipt.
- **Return-origin** (`purchase_item_id NULL`, `sale_return_item_id NOT NULL`): receives its **own newly issued** barcode when the return completes — never the original batch's. `B001`'s barcode is never reassigned to `R001`; scanning `B001`'s old barcode after a partial return still finds `B001` (with its reduced `available_quantity`), and scanning `R001`'s barcode finds `R001` specifically.

Because uniqueness is scoped to the batch, not the variant, `Red Saree` having three open batches (`B001`/barcode A, `B002`/barcode B, `B003`/barcode C) is normal — scanning barcode B finds `B002`, specifically, never "some batch of Red Saree." The database never parses a barcode's *content* to derive `variant_id` or anything else (see `inventory_batches`' barcode note); it's a safe opaque string, looked up by exact match. Nothing here assumes or enforces a particular symbology (EAN-13, Code128, a random internal string) — that choice, and whether a barcode is internally generated or an existing manufacturer code is reused, belongs entirely to the application layer.

**Expected lookup sequence**, restated as one flow (each step below already exists as a real constraint or trigger; this is the order the application walks them in):

```text
scan barcode
  → SELECT ... FROM inventory_batches WHERE tenant_id = $1 AND barcode = $2   (unique index)
  → batch not found?  reject
  → read variant_id off the batch row
  → sellables.status = 'active' AND variants.status = 'active'?               (same rule
                                                                                trg_sale_items_require_active_variant
                                                                                enforces — see that table)
  → not eligible?  reject before adding a line
  → check available_quantity > 0 (application pre-check; CHECK (available_quantity >= 0)
     on inventory_batches is the real, transaction-failing backstop — see that table)
  → INSERT sale_items (this variant) + sale_item_batches (this exact batch_id)
```

A scanned barcode names an exact `batch_id`; it is written straight into `sale_item_batches`, never substituted, never re-resolved through FIFO. This is unchanged from `sale_item_batches`' original design (see that table's "Barcode-first vs. variant-first" note) — this section restates it because the eligibility check above is new, not because the allocation behavior changed. Variant-first selling remains exactly FIFO — oldest `inventory_batches.received_at` first among *active-variant* eligible batches — with FEFO still deferred until expiry-enabled inventory exists. Barcode scanning and variant-first search stay two separate flows that both terminate in the same `sale_items` + `sale_item_batches` shape; nothing about this phase merges or changes either.

### Future pricing compatibility

Phase 1 has exactly one selling price per variant: `variants.base_price`, captured into `sale_items.unit_price` at the time of sale (see that column's note) so a later price change never touches a historical or even in-progress sale. No store-specific override and no price-history/audit trail exist yet — both are deferred (see "Future path") — but nothing here forecloses them: a future `variant_price_overrides`-style table (store-scoped, pointing at a variant) would sit *alongside* `base_price` as the thing the application checks first, and a future `variant_price_history` table (see "Future path", already anticipated before this phase) records who changed a price and when, independent of whichever column holds the *current* price at query time. Neither needs `base_price` to move, be renamed, or change meaning — `base_price` stays the tenant-wide master/default price either way.

---

## `purchases`

One purchase transaction from a supplier into a store (**`stores 1:N purchases`**, **`suppliers 1:N purchases`**).

```sql
CREATE TABLE purchases (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    supplier_id         UUID NOT NULL,
    reference_number    VARCHAR(100),
    purchase_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CONSTRAINT purchases_status_check
                            CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
    subtotal_amount     NUMERIC(14,2) NOT NULL DEFAULT 0
                            CONSTRAINT purchases_subtotal_check CHECK (subtotal_amount >= 0),
    discount_amount     NUMERIC(14,2) NOT NULL DEFAULT 0
                            CONSTRAINT purchases_discount_check CHECK (discount_amount >= 0),
    tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0
                            CONSTRAINT purchases_tax_check CHECK (tax_amount >= 0),
    adjustment_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    received_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT purchases_total_check
        CHECK (total_amount = subtotal_amount - discount_amount + tax_amount + adjustment_amount),
    CONSTRAINT purchases_received_at_check
        CHECK ((status = 'received') = (received_at IS NOT NULL)),

    -- target for purchase_items: keeps a line in the same tenant AND store as its purchase
    CONSTRAINT purchases_tenant_store_id_unique UNIQUE (tenant_id, store_id, id),
    CONSTRAINT purchases_store_fk
        FOREIGN KEY (tenant_id, store_id) REFERENCES stores (tenant_id, id),
    CONSTRAINT purchases_supplier_fk
        FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers (tenant_id, id)
);

-- the same supplier invoice cannot be entered twice (a cancelled one may be re-entered)
CREATE UNIQUE INDEX idx_purchases_supplier_reference_unique
    ON purchases (tenant_id, supplier_id, reference_number)
    WHERE reference_number IS NOT NULL AND status <> 'cancelled';

CREATE INDEX idx_purchases_store_date ON purchases (tenant_id, store_id, purchase_date DESC);
CREATE INDEX idx_purchases_supplier ON purchases (tenant_id, supplier_id);

CREATE TRIGGER trg_purchases_set_updated_at
    BEFORE UPDATE ON purchases
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- tenant/store never change; status may only move along the allowed edges below.
-- 'received' and 'cancelled' are terminal by construction: neither appears on the
-- left of an allowed edge, so any change away from them falls through to the exception.
CREATE FUNCTION purchases_guard_update() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id THEN
        RAISE EXCEPTION 'purchases tenant_id and store_id are immutable (purchase %)', OLD.id;
    END IF;
    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'draft'   AND NEW.status IN ('ordered', 'cancelled'))
            OR (OLD.status = 'ordered' AND NEW.status IN ('received', 'cancelled'))
        ) THEN
            RAISE EXCEPTION 'purchase % cannot go from % to %', OLD.id, OLD.status, NEW.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchases_guard_update
    BEFORE UPDATE ON purchases
    FOR EACH ROW
    EXECUTE FUNCTION purchases_guard_update();

-- header totals must equal the sum of the lines (checked at commit, see purchase_items)
CREATE FUNCTION check_purchase_totals(p_purchase_id UUID) RETURNS VOID AS $$
DECLARE
    p       purchases%ROWTYPE;
    v_sub   NUMERIC;
    v_disc  NUMERIC;
    v_tax   NUMERIC;
BEGIN
    SELECT * INTO p FROM purchases WHERE id = p_purchase_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(round(quantity * unit_cost, 2)), 0),
           COALESCE(SUM(discount_amount), 0),
           COALESCE(SUM(tax_amount), 0)
      INTO v_sub, v_disc, v_tax
      FROM purchase_items
     WHERE purchase_id = p_purchase_id;

    IF p.subtotal_amount <> v_sub OR p.discount_amount <> v_disc OR p.tax_amount <> v_tax THEN
        RAISE EXCEPTION 'purchase % header totals do not match its line items', p_purchase_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION trg_fn_purchase_totals_guard() RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'purchases' THEN
        PERFORM check_purchase_totals(NEW.id);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM check_purchase_totals(OLD.purchase_id);
    ELSE
        PERFORM check_purchase_totals(NEW.purchase_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_purchases_totals_guard
    AFTER INSERT OR UPDATE ON purchases
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_purchase_totals_guard();
```

- **Lifecycle, enforced edge by edge, not just as terminal states.** `trg_purchases_guard_update` allows exactly `draft → ordered`, `draft → cancelled`, `ordered → received`, `ordered → cancelled`, and nothing else — a direct `draft → received` is rejected, same as any other edge not on this list. `received` and `cancelled` are terminal because neither appears as a starting state on any edge, so the guard's fallthrough rejects any further change once a purchase reaches either.
- **`received` means "receiving has started," not "receiving is complete."** Nothing about this status requires every `purchase_item` to be fully received before the header can be `received` — a `purchase_item` for 100 units can have 40 units' worth of `inventory_batches` today and the remaining 60 arrive later as more batches against the same item, all while the header stays `received` throughout. `inventory_batches` can only be created once the purchase is already `received` (see that table), so "received" is the gate that opens receiving, not a claim that it's finished. There is no separate `partially_received` status in Phase 1 (see "Also pending" in Future path).
- **Because `received` is terminal, "a purchase can't be cancelled once inventory has arrived" falls out of the transition graph for free.** No `inventory_batches` row can exist while a purchase is still `draft`/`ordered` (batch creation requires `status = 'received'`), and once `received`, `cancelled` is no longer a reachable edge. So there is no code path where inventory exists and cancellation is still possible — nothing extra needed to enforce this beyond the edge list above. A goods return after receipt is a separate `purchase_returns` document (see that table), never a status change here — this row is never touched by a return, and there is no `returned` value in `purchases.status` and never will be.
- **Totals.** `total_amount = subtotal − discount + tax + adjustment`, enforced per row. `adjustment_amount` (may be negative) covers freight, round-off and any header-level discount, so the three line-derived totals stay exactly reconcilable. Whether `subtotal`/`discount`/`tax` equal the sums of the lines is a cross-row rule, enforced by the deferred trigger above. The application must recompute the header in the same transaction as any line change.
- **`reference_number`** is the supplier's invoice number and is optional (a draft may not have one yet).
- Excluded for now: payment status and amounts paid (a payables ledger concern, F-26) and purchase orders separate from invoices.

---

## `purchase_items`

The lines of a purchase (**`purchases 1:N purchase_items`**, **`variants 1:N purchase_items`**). This is where **purchase cost** lives.

```sql
CREATE TABLE purchase_items (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    purchase_id         UUID NOT NULL,
    variant_id          UUID NOT NULL,
    -- whole units only — matches inventory_batches/stock_movements; see that table's notes
    quantity            INTEGER NOT NULL
                            CONSTRAINT purchase_items_quantity_check CHECK (quantity > 0),
    unit_cost           NUMERIC(12,2) NOT NULL
                            CONSTRAINT purchase_items_unit_cost_check CHECK (unit_cost >= 0),
    discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0
                            CONSTRAINT purchase_items_discount_check CHECK (discount_amount >= 0),
    tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0
                            CONSTRAINT purchase_items_tax_check CHECK (tax_amount >= 0),
    line_total          NUMERIC(14,2) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT purchase_items_discount_within_line_check
        CHECK (discount_amount <= quantity * unit_cost),
    CONSTRAINT purchase_items_line_total_check
        CHECK (line_total = round(quantity * unit_cost - discount_amount + tax_amount, 2)),

    -- target for inventory_batches: a batch must agree with its line on tenant, store AND variant
    CONSTRAINT purchase_items_batch_target_unique
        UNIQUE (tenant_id, store_id, id, variant_id),
    CONSTRAINT purchase_items_purchase_fk
        FOREIGN KEY (tenant_id, store_id, purchase_id)
        REFERENCES purchases (tenant_id, store_id, id),
    CONSTRAINT purchase_items_variant_fk
        FOREIGN KEY (tenant_id, variant_id) REFERENCES variants (tenant_id, id)
);

CREATE INDEX idx_purchase_items_purchase ON purchase_items (purchase_id);
CREATE INDEX idx_purchase_items_variant ON purchase_items (tenant_id, variant_id);

CREATE TRIGGER trg_purchase_items_set_updated_at
    BEFORE UPDATE ON purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- lines are editable only while the purchase is open; once received or cancelled they are history
CREATE FUNCTION purchase_items_require_open_purchase() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM purchases
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_id ELSE NEW.purchase_id END;

    IF v_status NOT IN ('draft', 'ordered') THEN
        RAISE EXCEPTION 'purchase lines cannot be changed once the purchase is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_items_require_open_purchase
    BEFORE INSERT OR UPDATE OR DELETE ON purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION purchase_items_require_open_purchase();

-- the variant must be a product sold by the same store as the purchase
CREATE FUNCTION purchase_items_validate_variant() RETURNS TRIGGER AS $$
DECLARE
    v_store_id UUID;
    v_kind     VARCHAR(20);
BEGIN
    SELECT s.store_id, s.kind INTO v_store_id, v_kind
      FROM variants v
      JOIN sellables s ON s.id = v.sellable_id AND s.tenant_id = v.tenant_id
     WHERE v.id = NEW.variant_id AND v.tenant_id = NEW.tenant_id;

    IF v_store_id IS DISTINCT FROM NEW.store_id THEN
        RAISE EXCEPTION 'variant % does not belong to store %', NEW.variant_id, NEW.store_id;
    END IF;
    IF v_kind <> 'product' THEN
        RAISE EXCEPTION 'variant % is a % and cannot be purchased as stock', NEW.variant_id, v_kind;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_items_validate_variant
    BEFORE INSERT OR UPDATE ON purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION purchase_items_validate_variant();

CREATE FUNCTION purchase_items_prevent_parent_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.purchase_id <> OLD.purchase_id THEN
        RAISE EXCEPTION 'purchase_items tenant_id, store_id and purchase_id are immutable (item %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_items_prevent_parent_change
    BEFORE UPDATE ON purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION purchase_items_prevent_parent_change();

-- any line change re-verifies the header totals at commit
CREATE CONSTRAINT TRIGGER trg_purchase_items_totals_guard
    AFTER INSERT OR UPDATE OR DELETE ON purchase_items
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_purchase_totals_guard();
```

- **`unit_cost` is what we paid the supplier.** It is never copied into `variants.base_price`, and nothing reads it as a selling price.
- **`line_total = round(quantity × unit_cost − discount + tax, 2)`**, enforced by `CHECK`. `discount_amount` and `tax_amount` are absolute amounts for the whole line, not per unit or percentages, so the application computes them (tax rules belong to the compliance pack, N-11).
- **`tax_amount` here is *purchase* tax — tax paid to the supplier — and it stays scoped to this table.** There is no generic, shared `tax` concept anywhere in this schema: purchasing and sales are different transactions with different tax treatment (input tax vs. output tax), so `sale_items` (see the customers/payments phase) gets its own `tax_amount` column — same name, but on a different table, unambiguous within it — never a column literally shared with `purchase_items`. Neither concept lives on `inventory_batches`, which only ever stores acquisition cost (`unit_cost`) — see that table's notes.
- **`store_id` is denormalised on purpose.** It exists so a composite FK can force a line into the same store as its purchase, and so batches can inherit that store.
- The variant guard checks store and kind at write time. When sharing arrives, this one trigger is what gets relaxed.

---

## `inventory_batches`

Stock received through purchasing, tracked **per batch** with one barcode per batch (**`stores 1:N`**, **`variants 1:N`**, **`purchase_items 1:N inventory_batches`**). Phase 1 does not track individual units, and Phase 1 inventory quantities are **whole numbers** — no fractional units at the batch level.

**This table is the fast, operational read path for "how much of this is here right now."** It holds `available_quantity`, a running balance maintained transactionally from `stock_movements` (see the trigger below and "Batch balance vs. the ledger" further down) — the immutable ledger remains the append-only source of truth for *what happened*, but the batch row is where the barcode scanner and the POS actually read *current stock* from, because summing the whole ledger on every scan does not scale.

```sql
CREATE TABLE inventory_batches (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    variant_id          UUID NOT NULL,
    -- exactly one of these two names this batch's origin — see inventory_batches_origin_check.
    -- the sale_return_item_id -> sale_return_items FK is added by an ALTER TABLE after that
    -- table exists further down, not inline here — see the note there for why
    purchase_item_id    UUID,
    sale_return_item_id UUID,
    barcode             VARCHAR(64) NOT NULL,
    -- how many arrived — immutable, whole units only. For a return-origin batch this is the
    -- returned quantity, not a purchase receipt — see notes
    received_quantity   INTEGER NOT NULL
                            CONSTRAINT inventory_batches_received_quantity_check
                            CHECK (received_quantity > 0),
    -- how many are here now — mutable, maintained ONLY by the stock_movements trigger below
    available_quantity  INTEGER NOT NULL DEFAULT 0
                            CONSTRAINT inventory_batches_available_quantity_check
                            CHECK (available_quantity >= 0),
    -- acquisition cost basis for inventory valuation. No tax field here — see notes. For a
    -- return-origin batch this is copied from the original batch's unit_cost: same physical
    -- goods, same cost basis
    unit_cost           NUMERIC(12,2) NOT NULL
                            CONSTRAINT inventory_batches_unit_cost_check CHECK (unit_cost >= 0),
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- a barcode identifies exactly one batch within the tenant — a return-origin batch gets
    -- its own newly issued barcode, never the original batch's
    CONSTRAINT inventory_batches_tenant_barcode_unique UNIQUE (tenant_id, barcode),

    -- target for stock_movements: a movement must agree with its batch on tenant, store AND variant
    CONSTRAINT inventory_batches_movement_target_unique
        UNIQUE (tenant_id, store_id, id, variant_id),

    -- a batch is either purchase-origin or return-origin, never both, never neither
    CONSTRAINT inventory_batches_origin_check
        CHECK ((purchase_item_id IS NOT NULL) <> (sale_return_item_id IS NOT NULL)),

    -- one new batch per return line, never shared — also what makes the return-origin
    -- branch of trg_fn_inventory_batches_insert_guard below need no "total across several
    -- batches" check the way the purchase-origin branch does
    CONSTRAINT inventory_batches_sale_return_item_unique UNIQUE (sale_return_item_id),

    -- tenant, store and variant must all match the purchase line that produced the batch.
    -- MATCH SIMPLE (the default) skips this entirely for a return-origin batch, where
    -- purchase_item_id is NULL — exactly what's needed here
    CONSTRAINT inventory_batches_purchase_item_fk
        FOREIGN KEY (tenant_id, store_id, purchase_item_id, variant_id)
        REFERENCES purchase_items (tenant_id, store_id, id, variant_id),
    -- tenant AND store must also match the variant directly (not only transitively via the
    -- purchase item), now that variants carries its own store_id
    CONSTRAINT inventory_batches_variant_fk
        FOREIGN KEY (tenant_id, store_id, variant_id)
        REFERENCES variants (tenant_id, store_id, id)
);

-- tenant/store/variant inventory queries (e.g. "every batch of this variant in this store")
CREATE INDEX idx_inventory_batches_store_variant
    ON inventory_batches (tenant_id, store_id, variant_id, received_at);

-- purchase-item lookup (traceability: purchase → purchase item → its batches) — tenant_id
-- first, consistent with every other index in this schema (functionally redundant today,
-- since purchase_item_id is already a globally unique UUID, but kept consistent so this
-- index also benefits from RLS-aware tenant-scoped query plans, same as its siblings)
CREATE INDEX idx_inventory_batches_purchase_item ON inventory_batches (tenant_id, purchase_item_id);

-- barcode lookup is already served by inventory_batches_tenant_barcode_unique above;
-- batch lookup by id is already served by the primary key

CREATE TRIGGER trg_inventory_batches_set_updated_at
    BEFORE UPDATE ON inventory_batches
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- a batch is a receipt fact: only available_quantity (and updated_at) may change,
-- and available_quantity itself should only ever be touched by the trigger below —
-- see the REVOKE note
CREATE FUNCTION inventory_batches_prevent_core_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.variant_id <> OLD.variant_id
       OR NEW.purchase_item_id IS DISTINCT FROM OLD.purchase_item_id
       OR NEW.sale_return_item_id IS DISTINCT FROM OLD.sale_return_item_id
       OR NEW.barcode <> OLD.barcode
       OR NEW.received_quantity <> OLD.received_quantity
       OR NEW.unit_cost <> OLD.unit_cost
       OR NEW.received_at <> OLD.received_at THEN
        RAISE EXCEPTION 'inventory_batches are immutable except for available_quantity (batch %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_batches_prevent_core_change
    BEFORE UPDATE ON inventory_batches
    FOR EACH ROW
    EXECUTE FUNCTION inventory_batches_prevent_core_change();

-- checked at commit, so the batch and its receipt/return movement can be inserted in either
-- order. Branches on origin: a purchase-origin batch needs its purchase received and a
-- matching PURCHASED movement (unchanged from before); a return-origin batch needs its
-- sale_return completed and a matching SALE_RETURN movement instead
CREATE FUNCTION trg_fn_inventory_batches_insert_guard() RETURNS TRIGGER AS $$
DECLARE
    v_purchase_status VARCHAR(20);
    v_item_quantity   INTEGER;
    -- SUM() over an integer column returns bigint
    v_received_total  BIGINT;
    v_return_status   VARCHAR(20);
BEGIN
    IF NEW.purchase_item_id IS NOT NULL THEN
        SELECT p.status, pi.quantity
          INTO v_purchase_status, v_item_quantity
          FROM purchase_items pi
          JOIN purchases p ON p.id = pi.purchase_id AND p.tenant_id = pi.tenant_id
         WHERE pi.id = NEW.purchase_item_id;

        IF v_purchase_status <> 'received' THEN
            RAISE EXCEPTION 'batch % needs a received purchase (purchase is %)', NEW.id, v_purchase_status;
        END IF;

        -- one line may be split into several batches, but together they cannot exceed the line
        SELECT COALESCE(SUM(received_quantity), 0) INTO v_received_total
          FROM inventory_batches
         WHERE purchase_item_id = NEW.purchase_item_id;

        IF v_received_total > v_item_quantity THEN
            RAISE EXCEPTION 'batches for purchase item % total %, more than the purchased %',
                NEW.purchase_item_id, v_received_total, v_item_quantity;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM stock_movements
             WHERE batch_id = NEW.id
               AND movement_type = 'PURCHASED'
               AND quantity = NEW.received_quantity
        ) THEN
            RAISE EXCEPTION 'batch % has no matching PURCHASED stock movement', NEW.id;
        END IF;
    ELSE
        SELECT sr.status INTO v_return_status
          FROM sale_return_items sri
          JOIN sale_returns sr ON sr.id = sri.sale_return_id AND sr.tenant_id = sri.tenant_id
         WHERE sri.id = NEW.sale_return_item_id;

        IF v_return_status <> 'completed' THEN
            RAISE EXCEPTION 'batch % needs a completed sale return (return is %)', NEW.id, v_return_status;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM stock_movements
             WHERE batch_id = NEW.id
               AND movement_type = 'SALE_RETURN'
               AND quantity = NEW.received_quantity
        ) THEN
            RAISE EXCEPTION 'batch % has no matching SALE_RETURN stock movement', NEW.id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_inventory_batches_insert_guard
    AFTER INSERT ON inventory_batches
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_inventory_batches_insert_guard();
```

### Notes

- **A batch is either purchase-origin or return-origin, never both** (`inventory_batches_origin_check`). A return-origin batch is created when a `sale_return` completes (see that table): `sale_return_item_id` names the return line it came from, `purchase_item_id` is `NULL`, `received_quantity` is the returned quantity (not a purchase receipt), and `unit_cost` is copied from the *original* batch the goods were sold from — same physical goods, same cost basis, no re-costing invented for stock that never left the business's ownership. Everything else about the row — barcode, `available_quantity`, the `stock_movements` integration, the immutability rules — is identical to a purchase-origin batch; deliberately so, since returned stock must scan, sell and report exactly like any other batch. The FK from `sale_return_item_id` to `sale_return_items` is added by an `ALTER TABLE` after that table's own section, not inline in this `CREATE TABLE` — `inventory_batches → sale_return_items → sale_item_batches → inventory_batches` would otherwise be a genuine circular reference at DDL time (not just a documentation-ordering issue, the way `customers`/`sales` was): a `FOREIGN KEY` clause needs its target table to already exist, and `sale_return_items` is necessarily documented after `sale_item_batches`, which is documented after this table. The `sale_return_item_id` column, its `UNIQUE` constraint and the origin `CHECK` are all still declared here inline, since none of them reference another table.
- **One purchase line → many batches, as a *schema* capability — not exposed as a Phase 1 *workflow*.** The rule is *the batches' `received_quantity` together may not exceed the line's `quantity`*. It is deliberately **not** an equality: nothing here blocks a partial receipt, or a line split into several batches (each with its own barcode), and `purchase_item_id` stays a plain (non-unique) FK for exactly that reason. But the Phase 1 receiving *UI* only ever exposes the simple path — one purchase item becomes one batch, received in full, in one step. Multi-batch and partial receiving are not built as a feature the user can invoke; the schema just doesn't stand in the way when a later phase adds that UI, so this table needs no migration when it does. Over-receipt is still rejected regardless: if the supplier shipped 52 against an order of 50, correct the line to 52 first, so the record shows what really arrived.
- **Same variant, different costs.** `Red Silk Saree / 6m` can have Batch A (50 units at ₹1,500, barcode A) and Batch B (30 units at ₹1,650, barcode B). They are different rows under the same `variant_id`, each with its own barcode and cost basis.
- **`unit_cost` on the batch is the cost basis of that stock, and only that.** It starts as the purchase line's cost and is immutable. It is a separate column from `purchase_items.unit_cost` because the effective cost per unit can later include allocated discount, tax or freight, and because margin and cost-of-goods reporting must never depend on a line that could be edited. **No purchase-tax or sales-tax field lives here** — tax is a transaction-side concept (`purchase_items.tax_amount` on the purchase side, `sale_items.tax_amount` on the sales side), and the batch tracks acquisition cost for valuation, not tax. If inventory valuation is ever demonstrated to need a tax-inclusive cost basis, that is a deliberate follow-up decision, not a default.
- **`received_quantity` is immutable and whole-number only**: it is how many units arrived, not how many remain. `purchase_items.quantity` upstream is `INTEGER` too, so there is no fractional-to-whole boundary to reconcile anywhere in Phase 1 — every quantity column in the purchasing → batch → ledger chain is whole units, consistently. Weighed or fractional goods are not a Phase 1 concept at all; supporting them later means designing a proper unit-of-measure model (a unit column, a conversion/precision scheme) rather than quietly widening these columns back to `NUMERIC`.
- **`available_quantity` is the current operational balance, and the *only* mutable column on this table.** It starts at `0` and is changed **exclusively** by the `stock_movements` trigger described in that table's section below — never by a direct application `UPDATE`. A batch's first `PURCHASED` movement is what brings it from `0` up to `received_quantity`, using the exact same code path as every later `SOLD`, `DAMAGED`, `SALE_RETURN`, etc. — there is deliberately no special-cased "set available_quantity at batch creation" logic. See "Batch balance vs. the ledger" under `stock_movements` for why this can't drift from the ledger, and why `CHECK (available_quantity >= 0)` is a real, enforced backstop rather than a hopeful comment.
- **`REVOKE` is the second line of defence for `available_quantity`, same idiom as `stock_movements`.** `trg_inventory_batches_prevent_core_change` stops every column except `available_quantity` (and `updated_at`) from changing, but it cannot by itself distinguish a legitimate trigger-driven update from a direct application `UPDATE ... SET available_quantity = ...` that bypasses the ledger — both arrive as an ordinary `UPDATE` statement. `app_role` (see "The application-role privilege model," under "Row-level security") is granted no `UPDATE` on this table at all, and `REVOKE UPDATE (available_quantity) ON inventory_batches FROM app_role` is stated there explicitly as well (Postgres supports column-level privileges). A plain (`SECURITY INVOKER`, the PL/pgSQL default) function would run as whichever role fired the triggering `INSERT` and would be blocked by that same restriction — which is why `trg_fn_stock_movements_apply_to_batch` is declared `SECURITY DEFINER`, so it runs with the privileges of the function's owner (`app_owner`) regardless of who inserted the movement.
- **`barcode`** is a store-issued label unique per tenant (never global, so two tenants cannot collide), and is expected to encode a human-readable variant reference plus a unique batch reference — e.g. `VAR-RED-00001` for a batch of the "Red" variant. **This encoding is presentational only.** The database never parses `barcode` to derive `variant_id` or the batch's own `id` — both are stored as real columns and are what every join, constraint and query actually uses. Scanning a barcode is a lookup by the unique `(tenant_id, barcode)` index, which returns the row; the row's own `variant_id` (and, through it, cost and selling price) is what the application reads next.
- **No `status` column.** The previous `active` / `blocked` / `archived` states are superseded by `available_quantity`: "sold out" is `available_quantity = 0`, and a `DAMAGED`/`LOST` movement already removes damaged or lost stock from `available_quantity` directly, so those units stop being sellable without a separate "blocked" flag. A distinct "held out of sale but not damaged/lost" state (e.g. a recall on stock that is otherwise fine, or a returned batch pending inspection before it's resold or moved into a clearance flow — see `sale_returns`' "Future path" note) is not modelled in Phase 1; if that need shows up, it is an additive column, not a redesign. Nothing about the dual-origin design above narrows that door: a future `condition`/`disposition` column would apply the same way to either origin.
- **`available_quantity` is not clamped to `received_quantity` — only the floor is enforced.** Nothing prevents `available_quantity` from exceeding `received_quantity` if, say, a `SALE_RETURN` is posted incorrectly; that's a data-entry mistake to catch (e.g. via the reconciliation query above, or an application-level sanity check) and correct with a compensating movement, not a scenario the schema hard-forbids. The floor is different: `CHECK (available_quantity >= 0)` is a hard, transaction-failing constraint (see "Batch balance vs. the ledger"), because going negative means the physical scan/sale that triggered it cannot actually be fulfilled — an asymmetry that matches the real-world asymmetry between "can't sell what isn't there" and "a return was probably just logged against the wrong batch."
- **Batches can only be created against a `received` purchase or a `completed` sale return, so history and stock cannot drift** — enforced by `trg_fn_inventory_batches_insert_guard`'s two branches, one per origin.
- **Future batch splitting** (not implemented in Phase 1) takes one existing batch's `available_quantity` and divides it into several new whole-number batches that preserve `variant_id` (and, for provenance, `purchase_item_id`, since the goods still trace back to the same original purchase line). This needs at least a way to link a child batch back to the batch it was split from — most likely a nullable `parent_batch_id` self-reference added later, plus a new `stock_movements` movement type (or pair of types) to record the split as ledger events, exactly the way "Phase 1 movement types are open-ended, migratable `CHECK` values" already anticipates. Nothing in this table's current shape blocks that migration.

---

## `stock_movements`

The append-only ledger behind inventory. **There is no `on_hand_quantity` column anywhere — not on the batch, not on the variant.** Stock on hand is always a `SUM()` over this table. This follows design principle six and F-04, and gives the consultant a real history (F-19, F-20).

```sql
CREATE TABLE stock_movements (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    variant_id          UUID NOT NULL,
    batch_id            UUID NOT NULL,
    movement_type       VARCHAR(30) NOT NULL
                            CONSTRAINT stock_movements_type_check
                            CHECK (movement_type IN (
                                'PURCHASED', 'SOLD', 'PURCHASE_RETURN', 'SALE_RETURN',
                                'DAMAGED', 'LOST', 'INTERNAL_USE', 'PURCHASE_RETURN_REVERSAL',
                                'SOLD_REVERSAL')),
    -- always positive, whole units only; movement_type alone decides direction (see the sign
    -- function below) — matches inventory_batches, which is also integer-quantity in Phase 1
    quantity            INTEGER NOT NULL
                            CONSTRAINT stock_movements_quantity_positive_check CHECK (quantity > 0),
    reference_type      VARCHAR(30)
                            CONSTRAINT stock_movements_reference_type_check
                            CHECK (reference_type IN (
                                'PURCHASE_ITEM', 'SALE_ITEM', 'PURCHASE_RETURN', 'SALE_RETURN',
                                'STOCK_ADJUSTMENT')),
    reference_id        UUID,
    reason              VARCHAR(500),
    -- when the stock event actually happened (business time) — may be backdated
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID NOT NULL REFERENCES users (id),
    -- when the ledger row was recorded (system/insert time) — never backdated
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- a reference is an all-or-nothing pair; a movement may have neither (see notes)
    CONSTRAINT stock_movements_reference_pair_check
        CHECK ((reference_type IS NULL) = (reference_id IS NULL)),

    -- store, variant and batch must all agree with each other, transitively via the batch's own FKs
    CONSTRAINT stock_movements_batch_fk
        FOREIGN KEY (tenant_id, store_id, batch_id, variant_id)
        REFERENCES inventory_batches (tenant_id, store_id, id, variant_id)
);

-- tenant/store/variant inventory queries (e.g. "on hand for this variant in this store")
CREATE INDEX idx_stock_movements_variant
    ON stock_movements (tenant_id, store_id, variant_id, occurred_at);

-- batch inventory queries (e.g. "on hand for this specific batch")
CREATE INDEX idx_stock_movements_batch
    ON stock_movements (tenant_id, store_id, batch_id, occurred_at);

-- reference lookup (e.g. "every movement this sale produced") — NOT unique: PHASE 1
-- requirement, several movements can share one reference_id (see notes)
CREATE INDEX idx_stock_movements_reference
    ON stock_movements (tenant_id, reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- chronological ledger queries (e.g. a tenant-wide activity feed, or an export) —
-- ordered by business time, not insert time; see the occurred_at vs created_at note
CREATE INDEX idx_stock_movements_occurred_at
    ON stock_movements (tenant_id, occurred_at);

-- a reversal of one specific prior action may post at most once per (batch, reference)
-- pair — closes, for the ledger's own reversal types, the same "can this happen twice"
-- gap customer_credit_ledger's reversal already closes via
-- idx_customer_credit_ledger_reverses_entry_unique. Deliberately scoped to ONLY
-- SOLD_REVERSAL and PURCHASE_RETURN_REVERSAL: PURCHASED, SOLD, SALE_RETURN and
-- PURCHASE_RETURN all legitimately post more than once against the same batch (multi-batch
-- receiving, repeat sales from one batch over time, multiple partial returns — see this
-- table's own notes on why no uniqueness constraint exists for those), so this index must
-- never be widened to cover them.
CREATE UNIQUE INDEX idx_stock_movements_reversal_unique
    ON stock_movements (batch_id, movement_type, reference_type, reference_id)
    WHERE movement_type IN ('SOLD_REVERSAL', 'PURCHASE_RETURN_REVERSAL');

-- append-only: no updates, no deletes, ever — a correction is a new, compensating row
CREATE FUNCTION stock_movements_reject_change() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'stock_movements is append-only; record a correcting movement instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movements_append_only
    BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION stock_movements_reject_change();

-- +1 for movement types that add stock, -1 for movement types that remove it.
-- IMMUTABLE so it can be used in the view below, in a future generated column,
-- or in an index, without being re-evaluated on every read.
CREATE FUNCTION stock_movement_sign(p_movement_type VARCHAR) RETURNS SMALLINT AS $$
BEGIN
    RETURN CASE p_movement_type
        WHEN 'PURCHASED'                THEN  1
        WHEN 'SALE_RETURN'              THEN  1
        WHEN 'PURCHASE_RETURN_REVERSAL' THEN  1
        WHEN 'SOLD_REVERSAL'            THEN  1
        WHEN 'SOLD'                     THEN -1
        WHEN 'PURCHASE_RETURN'          THEN -1
        WHEN 'DAMAGED'                  THEN -1
        WHEN 'LOST'                     THEN -1
        WHEN 'INTERNAL_USE'             THEN -1
        ELSE NULL
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- current stock is a projection of the ledger, never a stored fact — kept as the
-- reconciliation/audit path; inventory_batches.available_quantity is the fast operational path
CREATE VIEW batch_stock_on_hand WITH (security_invoker = true) AS
SELECT tenant_id, store_id, variant_id, batch_id,
       SUM(quantity * stock_movement_sign(movement_type)) AS on_hand
  FROM stock_movements
 GROUP BY tenant_id, store_id, variant_id, batch_id;

-- every posted movement immediately (same transaction, not deferred) applies itself to its
-- batch's operational balance — this is the ONLY code path allowed to change
-- inventory_batches.available_quantity; see the REVOKE note below.
-- SECURITY DEFINER (+ a locked search_path, standard hardening for definer functions) is
-- required here: a plain SECURITY INVOKER function runs as the CALLING role, so if the app
-- role's UPDATE on available_quantity is revoked (per that same note), an invoker-rights
-- version of this function would fail too, taking the whole insert down with it.
CREATE FUNCTION trg_fn_stock_movements_apply_to_batch() RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory_batches
       SET available_quantity = available_quantity
                                 + (NEW.quantity * stock_movement_sign(NEW.movement_type))
     WHERE id = NEW.batch_id
       AND tenant_id = NEW.tenant_id
       AND store_id = NEW.store_id
       AND variant_id = NEW.variant_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE TRIGGER trg_stock_movements_apply_to_batch
    AFTER INSERT ON stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_stock_movements_apply_to_batch();
```

### Notes

- **`quantity` is always positive.** Every row's `CHECK (quantity > 0)` is unconditional — there is no signed delta column. Direction comes entirely from `movement_type`, via `stock_movement_sign()`:
  - **Adds stock:** `PURCHASED`, `SALE_RETURN`, `PURCHASE_RETURN_REVERSAL`, `SOLD_REVERSAL`
  - **Removes stock:** `SOLD`, `PURCHASE_RETURN`, `DAMAGED`, `LOST`, `INTERNAL_USE`
  - This is deliberately simpler than an application-supplied signed delta: the direction is a property of the *type*, not something each caller can get backwards. A caller only ever writes "10 units, `SOLD`", never "-10 units."
- **No `updated_at`, no updates, no deletes — enforced twice.** The `BEFORE UPDATE OR DELETE` trigger rejects every attempt at the row level; `app_role` additionally has `UPDATE, DELETE, TRUNCATE` revoked at the privilege level ("The application-role privilege model," under "Row-level security"), as a second line of defence. A posting mistake is fixed by inserting a new row with the opposite-direction movement type (e.g. a wrongly posted `SOLD` is corrected with a `SALE_RETURN`, or a wrongly posted `DAMAGED` with a manually justified `PURCHASE`-side adjustment through `STOCK_ADJUSTMENT`), never by touching the original row. History is never rewritten, so an audit trail and a stock count always agree with what was actually posted.
- **`reference_type` + `reference_id` trace a movement back to the business transaction that caused it** — a purchase line, a sale line, a return document, or a manual stock adjustment. Phase 1's values: `PURCHASE_ITEM`, `SALE_ITEM`, `PURCHASE_RETURN`, `SALE_RETURN`, `STOCK_ADJUSTMENT`. The pair is polymorphic (it can point at rows in different tables depending on `reference_type`), so it cannot be a real foreign key the way, say, `sale_items.sale_id` is — the application is responsible for `reference_id` actually existing in the table `reference_type` names, scoped to the same `tenant_id`.
- **`reference_id` is intentionally *not* unique, with one narrow exception.** One business transaction routinely produces several movement rows — a `sale_items` line spanning two batches posts two `SOLD` movements sharing the same `SALE_ITEM` `reference_id` (see `sale_item_batches`), one per batch it drew from; a multi-batch purchase receipt posts one `PURCHASED` movement per batch, all sharing the same `reference_id` when it identifies the purchase line rather than a single batch. `idx_stock_movements_reference` is a plain (non-unique) index for exactly this "fetch every movement this transaction produced" query. The one exception is `idx_stock_movements_reversal_unique` (below), which *does* enforce uniqueness, but only for `SOLD_REVERSAL`/`PURCHASE_RETURN_REVERSAL` and only on the combination `(batch_id, movement_type, reference_type, reference_id)` together — a reversal of one specific prior action should only ever happen once, which is a narrower, different claim than "`reference_id` alone is unique."
- **`reference_type`/`reference_id` are both optional together.** Some movements — a shrinkage write-off, a stock take done by feel rather than a formal `STOCK_ADJUSTMENT` record — have no upstream document to point at. `reason` (free text) carries the justification instead. The pair-check constraint only guarantees the two columns move together: never a `reference_type` with no `reference_id` or vice versa.
- **Receipt is part of the foundation, but the ledger itself does not enforce "exactly one."** Every batch must have at least one `PURCHASED` movement equal to its `received_quantity` — enforced by the deferred trigger on `inventory_batches` (which checks `movement_type = 'PURCHASED' AND quantity = received_quantity`), so a batch can never exist without a matching receipt in the ledger. There is deliberately **no uniqueness constraint** tying a batch to a single `PURCHASED` row: that would couple the ledger's shape to the current purchase workflow. Purchase-receipt integrity (a batch is received exactly once today) is a rule of the *purchasing* workflow, enforced there; the ledger's job is only to record what happened, not to police how many times a given business process is allowed to write to it. This also keeps the door open for a batch to legitimately gain more `PURCHASED` rows later (e.g. a correction, or a future batch-split flow) without a schema change.
- **A reversal is the opposite case, and does get a real uniqueness constraint: `idx_stock_movements_reversal_unique`.** Unlike receiving (open-ended by design) or selling/returning (legitimately repeatable against one batch), a `SOLD_REVERSAL` or `PURCHASE_RETURN_REVERSAL` is defined as undoing one specific, already-posted action — voiding *this* sale's allocation from *this* batch, or reversing *this* return line. There's no legitimate reason for that exact pairing to ever post twice, so the index enforces it, the same way `customer_credit_ledger`'s own reversal gets `idx_customer_credit_ledger_reverses_entry_unique`. Without it, nothing stops a retried or double-submitted void/reversal request from posting the same compensating movement twice — the completion/void guards elsewhere in this document (`check_sale_item_batch_movements`, `check_purchase_return_movements`) only ever check that a matching movement *exists*, never that it exists *exactly once*, so this index is what actually closes that gap rather than the guards doing it incidentally.
- **Batch balance vs. the ledger: every insert applies itself, in the same transaction, by construction.** `trg_stock_movements_apply_to_batch` fires `AFTER INSERT` (not deferred) and updates the matching batch's `available_quantity` before the statement completes. Because that update is subject to `inventory_batches`' `CHECK (available_quantity >= 0)`, a movement that would take a batch's balance negative makes the **whole transaction fail** — the `stock_movements` row is never actually committed either. This is a deliberate reversal from the ledger-only design: on-hand is no longer allowed to drift negative as an "estimate" the way a pure `SUM()`-based ledger could. `available_quantity >= 0` is the validation named in the stock-movement integration requirements ("validate sufficient available stock where applicable"), enforced uniformly for every movement type via one `CHECK`, rather than bespoke per-type application logic. The application should still pre-check `available_quantity` before attempting the insert for a good error message — the `CHECK` is the non-negotiable backstop, not the primary UX.
- **`created_by` is required** (`NOT NULL`), unlike most other tables' optional audit columns — every ledger entry must be attributable to the user or system actor that posted it, since a ledger with anonymous entries is not auditable.
- **`occurred_at` (business time) and `created_at` (record time) are both kept, and can diverge.** Inventory movements are financial/operational history, and delayed entry, corrections and future imports are plausible — a cashier fixing yesterday's miscount today should be able to say the event happened yesterday even though the row is inserted now. `occurred_at` defaults to `now()` for the common synchronous case (a sale posts its movement at the moment of sale) but the application may set it explicitly for a backdated or imported entry. `created_at` is never backdated — it is strictly "when this row entered the table," which is what the append-only/audit guarantees above are actually about. Chronological ledger and inventory-query indexes are built on `occurred_at`, since that is the axis a ledger reader cares about; `created_at` remains for audit ordering ("what did we actually insert, and in what order").
- **Phase 1 movement types are the nine above**: seven originally, plus `PURCHASE_RETURN_REVERSAL` (purchase-return reversal) and `SOLD_REVERSAL` (voiding a completed sale — see `sales`). No F&B-specific types (e.g. recipe consumption) and no multi-store transfer types yet — both are additive migrations (new `CHECK` values, new `reference_type` values), not redesigns of this table, and the two reversal types are the proof: each slotted in as one more `CHECK`/`stock_movement_sign()` value, with zero changes to this table's columns or `trg_stock_movements_apply_to_batch`. `SOLD_REVERSAL` is deliberately its own type, not a reuse of the existing `SALE_RETURN` — a customer physically returning goods and a cashier voiding an erroneous transaction are different business events that happen to share a stock effect; conflating them would lose that distinction in the ledger. Batch splitting is expected to be similarly additive: a new movement type or two, not a change to the columns here, which is why `quantity`/`movement_type`/`reference_type` are kept as open-ended, migratable `CHECK`-based enums rather than baked into the table shape.
- **No serialized unit tracking.** This ledger moves quantities of a batch, never individual serialized units — that is a future `stock_units` table beneath batches (see "Future path" below), not a Phase 1 concern.
- **Performance is no longer a "later" problem for the common read.** `inventory_batches.available_quantity` *is* the cached/projected balance this section previously described as a future optimisation — it now exists from Phase 1, trigger-maintained so it cannot silently drift out of sync with the ledger. `batch_stock_on_hand` (the `SUM()` view) remains for reconciliation, audit and "does the cache still agree with the ledger" checks, not as the primary read path.

### Why an append-only ledger, not a mutable `on_hand_quantity` — and how `available_quantity` is different

A mutable `on_hand_quantity` column that the **application writes to directly** — as its own independent fact, alongside the ledger — is a **cache with no history and no guarantee of staying correct**: every write clobbers the previous value, so there is no way to answer "what was on hand last Tuesday," "why did stock drop by 3," or "did the count match what we sold" after the fact. It also creates a second source of truth that a ledger-based system must keep in sync *by hand* — every sale, return, receipt and adjustment would need application code to remember to update both the ledger *and* the counter in the same transaction, and any missed or double-applied update silently drifts the counter away from reality with no way to detect or repair it except a manual recount.

**`inventory_batches.available_quantity` is not that.** The distinction is not "is there a stored number" — there now is one — it's *who is allowed to write it and how*:

- **It has exactly one writer: the ledger itself.** `available_quantity` is changed only by `trg_stock_movements_apply_to_batch`, fired automatically by every `stock_movements` insert. There is no application code path that sets it directly (see the `REVOKE` note in `inventory_batches`), so there is no "forgot to update the counter" failure mode — the counter update isn't a second statement someone has to remember, it's a side effect of the one statement (the ledger insert) that always has to happen anyway.
- **It cannot silently diverge, because divergence fails the transaction, not the check.** If the trigger's update would violate `CHECK (available_quantity >= 0)`, the whole transaction — ledger insert included — rolls back. The ledger and the balance either both advance together or neither does; there is no state where one moved and the other didn't.
- **It is still fully reconstructable from the ledger**, via `batch_stock_on_hand`, at any time — it is a cache *of* the ledger, not an alternative to it. If the two ever disagreed (they shouldn't, by the construction above, but hardware/software bugs happen), `batch_stock_on_hand` is the source of truth to reconcile against, exactly as "Performance" describes.
- **Every change is still self-explanatory, at the ledger.** Each `stock_movements` row carries what changed, why, who and when — the audit trail is unaffected by `available_quantity` existing; the cache adds a fast read path, it doesn't replace or shadow the audit trail.
- **Corrections are still visible, not silent.** Fixing a mistake means posting a new compensating row (which updates `available_quantity` the same way every other row does), so the ledger — and the balance derived from it — show both the error and its correction.

So the rule from the original design is unchanged: no column anywhere is an **independent, application-writable** running total. What's new is that one column, on one table, is allowed to be a **ledger-writable, trigger-enforced cache** of that same ledger — which is a fundamentally different (and much safer) thing than a second source of truth.

Example queries:

```sql
-- what does this scanned barcode mean, and how much is left? (price from the variant,
-- cost from the batch, current stock straight off the batch row — no SUM needed)
SELECT b.id AS batch_id, b.available_quantity, s.name AS sellable, v.name AS variant,
       v.base_price AS selling_price, b.unit_cost AS purchase_cost
  FROM inventory_batches b
  JOIN variants v  ON v.id = b.variant_id  AND v.tenant_id = b.tenant_id
  JOIN sellables s ON s.id = v.sellable_id AND s.tenant_id = v.tenant_id
 WHERE b.tenant_id = $1 AND b.barcode = $2;

-- units on hand per variant in a store — fast path, straight off inventory_batches
SELECT variant_id, SUM(available_quantity) AS on_hand
  FROM inventory_batches
 WHERE tenant_id = $1 AND store_id = $2
 GROUP BY variant_id;

-- reconciliation: does the ledger agree with the cached batch balance? (audit / drift check)
SELECT b.id AS batch_id, b.available_quantity AS cached_balance, v.on_hand AS ledger_balance
  FROM inventory_batches b
  JOIN batch_stock_on_hand v
    ON v.tenant_id = b.tenant_id AND v.store_id = b.store_id
   AND v.variant_id = b.variant_id AND v.batch_id = b.id
 WHERE b.tenant_id = $1 AND b.available_quantity IS DISTINCT FROM v.on_hand;

-- every movement a given sale produced (reference lookup, e.g. for a receipt/audit screen)
SELECT *
  FROM stock_movements
 WHERE tenant_id = $1 AND reference_type = 'SALE_ITEM' AND reference_id = $2
 ORDER BY created_at;

-- chronological ledger for a store (activity feed / export), by business time
SELECT *
  FROM stock_movements
 WHERE tenant_id = $1 AND store_id = $2
 ORDER BY occurred_at DESC
 LIMIT 100;
```

---

## `purchase_returns`

A supplier return transaction — goods going back to the supplier against a `received` purchase (**`purchases 1:N purchase_returns`**). **The original `purchases` row is never touched**: a return is a new, separate document that points back at it, not an edit or a status change on it (see that table's notes).

```sql
CREATE TABLE purchase_returns (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    purchase_id         UUID NOT NULL,
    return_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    reason              VARCHAR(500),
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CONSTRAINT purchase_returns_status_check
                            CHECK (status IN ('draft', 'completed', 'reversed')),
    created_by          UUID NOT NULL REFERENCES users (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- target for purchase_return_items: keeps a line in the same tenant AND store as its return
    CONSTRAINT purchase_returns_tenant_store_id_unique UNIQUE (tenant_id, store_id, id),
    -- tenant AND store must match the original purchase
    CONSTRAINT purchase_returns_purchase_fk
        FOREIGN KEY (tenant_id, store_id, purchase_id)
        REFERENCES purchases (tenant_id, store_id, id)
);

CREATE INDEX idx_purchase_returns_purchase ON purchase_returns (tenant_id, purchase_id);
CREATE INDEX idx_purchase_returns_store_date ON purchase_returns (tenant_id, store_id, return_date DESC);

CREATE TRIGGER trg_purchase_returns_set_updated_at
    BEFORE UPDATE ON purchase_returns
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- tenant/store/purchase never change; status only moves draft -> completed -> reversed.
-- 'reversed' is terminal by construction, same "no edge starts here" idiom as purchases.
CREATE FUNCTION purchase_returns_guard_update() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.purchase_id <> OLD.purchase_id THEN
        RAISE EXCEPTION 'purchase_returns tenant_id, store_id and purchase_id are immutable (return %)', OLD.id;
    END IF;
    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'draft'     AND NEW.status = 'completed')
            OR (OLD.status = 'completed' AND NEW.status = 'reversed')
        ) THEN
            RAISE EXCEPTION 'purchase_return % cannot go from % to %', OLD.id, OLD.status, NEW.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_returns_guard_update
    BEFORE UPDATE ON purchase_returns
    FOR EACH ROW
    EXECUTE FUNCTION purchase_returns_guard_update();

-- nothing is eligible for return until it has actually been received — checked once, at
-- draft creation; a purchase can't stop being 'received' later (that status is terminal),
-- so there's no need to re-check this at completion time
CREATE FUNCTION purchase_returns_require_received_purchase() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status FROM purchases WHERE id = NEW.purchase_id;

    IF v_status <> 'received' THEN
        RAISE EXCEPTION 'purchase % is % and is not eligible for a return', NEW.purchase_id, v_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_returns_require_received_purchase
    BEFORE INSERT ON purchase_returns
    FOR EACH ROW
    EXECUTE FUNCTION purchase_returns_require_received_purchase();

-- shared by the completion and reversal guards below: does every item on this return
-- already have the matching stock_movements row for the given movement_type?
CREATE FUNCTION check_purchase_return_movements(
    p_return_id UUID, p_expected_movement_type VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_missing INTEGER;
BEGIN
    SELECT count(*) INTO v_missing
      FROM purchase_return_items pri
     WHERE pri.purchase_return_id = p_return_id
       AND NOT EXISTS (
           SELECT 1 FROM stock_movements sm
            WHERE sm.batch_id = pri.batch_id
              AND sm.movement_type = p_expected_movement_type
              AND sm.reference_type = 'PURCHASE_RETURN'
              AND sm.reference_id = pri.id
              AND sm.quantity = pri.quantity
       );

    IF v_missing > 0 THEN
        RAISE EXCEPTION 'purchase_return % is missing % stock movement(s) of type % for its items',
            p_return_id, v_missing, p_expected_movement_type;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- checked at commit, so the application can insert the stock_movements rows and flip
-- this header's status in either order within the same transaction
CREATE FUNCTION trg_fn_purchase_returns_completion_guard() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status = 'draft' THEN
        IF NOT EXISTS (SELECT 1 FROM purchase_return_items WHERE purchase_return_id = NEW.id) THEN
            RAISE EXCEPTION 'purchase_return % has no items to complete', NEW.id;
        END IF;
        PERFORM check_purchase_return_movements(NEW.id, 'PURCHASE_RETURN');
    ELSIF NEW.status = 'reversed' AND OLD.status = 'completed' THEN
        PERFORM check_purchase_return_movements(NEW.id, 'PURCHASE_RETURN_REVERSAL');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_purchase_returns_completion_guard
    AFTER UPDATE ON purchase_returns
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_purchase_returns_completion_guard();
```

### Notes

- **Lifecycle: `draft` → `completed` → `reversed`, each edge one-way.** A draft is where a return is assembled — its items can be added, edited and removed freely (see `purchase_return_items`) and it has **no stock effect at all** while draft. Moving to `completed` is what actually posts stock: the application inserts one `PURCHASE_RETURN` `stock_movements` row per `purchase_return_items` row (each decrementing its batch's `available_quantity` via the existing trigger) and flips this row's status to `completed`, all in one transaction; `trg_purchase_returns_completion_guard` verifies at commit that every item really does have its matching movement, so a return can't reach `completed` with some items posted and others silently missing. `reversed` is reached the same way — insert the compensating `PURCHASE_RETURN_REVERSAL` movements, then flip status — and is terminal: nothing transitions out of `reversed`, which is also what makes "a completed return can't be reversed twice" true without any extra bookkeeping (a second reversal attempt is just an illegal `reversed → reversed` no-op-that-isn't, rejected by the same guard).
- **`completed` and `reversed` rows are never edited or deleted by the application to represent what happened next.** A cancelled-before-completion draft is simply left as `draft` or its items removed (no stock was ever posted, so there's nothing to undo); a completed return that needs undoing is *reversed*, which is a new set of movements referencing the original, never a rewrite of it. The original `purchase_returns`/`purchase_return_items` rows for a completed-then-reversed return are byte-for-byte what they were the moment they completed.
- **Eligibility is checked once, at draft creation.** `trg_purchase_returns_require_received_purchase` requires `purchases.status = 'received'` before a return can even be drafted — there is nothing to return against a `draft`, `ordered`, or `cancelled` purchase. Since `received` is terminal on `purchases` (see that table), this can't become stale between draft creation and completion.
- **`reason`** is free text at the header level (why the whole return happened — a damaged shipment, a wrong item, an over-ship correction). Line-level detail lives on `purchase_return_items` implicitly through which batches and quantities were selected; Phase 1 does not add a second, per-line `reason`.
- **`created_by` is required** (`NOT NULL`), same rationale as `stock_movements.created_by`: a return is a financial/inventory transaction and must be attributable to whoever created it. It names who drafted the return, not necessarily who completed or reversed it — Phase 1 doesn't track a separate actor per status transition; the `stock_movements` rows posted at completion/reversal carry their own `created_by`, which is where that finer-grained attribution actually lives.

---

## `purchase_return_items`

The specific stock being returned — one row per batch a return draws from (**`purchase_returns 1:N purchase_return_items`**, **`purchase_items 1:N purchase_return_items`**, **`inventory_batches 1:N purchase_return_items`**). This is where the returned quantity and its preserved cost basis live.

```sql
CREATE TABLE purchase_return_items (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    variant_id          UUID NOT NULL,
    purchase_return_id  UUID NOT NULL,
    purchase_item_id    UUID NOT NULL,
    batch_id            UUID NOT NULL,
    -- whole units only, matching inventory_batches/stock_movements
    quantity            INTEGER NOT NULL
                            CONSTRAINT purchase_return_items_quantity_check CHECK (quantity > 0),
    -- must match the batch's own immutable cost basis at all times — see notes
    unit_cost           NUMERIC(12,2) NOT NULL
                            CONSTRAINT purchase_return_items_unit_cost_check CHECK (unit_cost >= 0),
    -- purchase-side tax being credited back; the application derives this proportionally
    -- from purchase_items.tax_amount — see notes
    tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0
                            CONSTRAINT purchase_return_items_tax_check CHECK (tax_amount >= 0),
    line_total          NUMERIC(14,2) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT purchase_return_items_line_total_check
        CHECK (line_total = round(quantity * unit_cost + tax_amount, 2)),

    -- keeps a return line in the same tenant AND store as its return header
    CONSTRAINT purchase_return_items_return_fk
        FOREIGN KEY (tenant_id, store_id, purchase_return_id)
        REFERENCES purchase_returns (tenant_id, store_id, id),
    -- the original purchase line: tenant, store AND variant must all agree
    CONSTRAINT purchase_return_items_purchase_item_fk
        FOREIGN KEY (tenant_id, store_id, purchase_item_id, variant_id)
        REFERENCES purchase_items (tenant_id, store_id, id, variant_id),
    -- the batch being returned from: tenant, store AND variant must all agree
    CONSTRAINT purchase_return_items_batch_fk
        FOREIGN KEY (tenant_id, store_id, batch_id, variant_id)
        REFERENCES inventory_batches (tenant_id, store_id, id, variant_id)
);

CREATE INDEX idx_purchase_return_items_return ON purchase_return_items (purchase_return_id);
CREATE INDEX idx_purchase_return_items_purchase_item ON purchase_return_items (purchase_item_id);
CREATE INDEX idx_purchase_return_items_batch ON purchase_return_items (batch_id);

CREATE TRIGGER trg_purchase_return_items_set_updated_at
    BEFORE UPDATE ON purchase_return_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- cross-row checks a composite FK can't express: the batch must be the one this purchase line
-- actually produced, the purchase line must actually belong to the purchase this return is
-- against, and the preserved unit_cost must match the batch's own immutable cost basis.
-- Re-runs on every UPDATE too (not just INSERT), since quantity/unit_cost/tax_amount stay
-- editable while the return is draft — see the draft-only guard below.
CREATE FUNCTION purchase_return_items_validate() RETURNS TRIGGER AS $$
DECLARE
    v_batch_purchase_item_id UUID;
    v_batch_unit_cost        NUMERIC(12,2);
    v_return_purchase_id     UUID;
    v_item_purchase_id       UUID;
BEGIN
    SELECT purchase_item_id, unit_cost INTO v_batch_purchase_item_id, v_batch_unit_cost
      FROM inventory_batches
     WHERE id = NEW.batch_id AND tenant_id = NEW.tenant_id;

    IF v_batch_purchase_item_id <> NEW.purchase_item_id THEN
        RAISE EXCEPTION 'batch % was not received against purchase item %', NEW.batch_id, NEW.purchase_item_id;
    END IF;

    IF NEW.unit_cost <> v_batch_unit_cost THEN
        RAISE EXCEPTION 'purchase_return_items.unit_cost must match batch % cost basis (%), got %',
            NEW.batch_id, v_batch_unit_cost, NEW.unit_cost;
    END IF;

    SELECT purchase_id INTO v_item_purchase_id
      FROM purchase_items
     WHERE id = NEW.purchase_item_id AND tenant_id = NEW.tenant_id;

    SELECT purchase_id INTO v_return_purchase_id
      FROM purchase_returns
     WHERE id = NEW.purchase_return_id AND tenant_id = NEW.tenant_id;

    IF v_item_purchase_id <> v_return_purchase_id THEN
        RAISE EXCEPTION 'purchase item % does not belong to the purchase being returned against (return %)',
            NEW.purchase_item_id, NEW.purchase_return_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_return_items_validate
    BEFORE INSERT OR UPDATE ON purchase_return_items
    FOR EACH ROW
    EXECUTE FUNCTION purchase_return_items_validate();

-- identity (which return/purchase item/batch/variant/tenant/store this line is for) is
-- immutable from the moment a line exists — only quantity/unit_cost/tax_amount/line_total
-- may change, and only while the parent return is still draft (next trigger)
CREATE FUNCTION purchase_return_items_prevent_identity_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.variant_id <> OLD.variant_id
       OR NEW.purchase_return_id <> OLD.purchase_return_id
       OR NEW.purchase_item_id <> OLD.purchase_item_id
       OR NEW.batch_id <> OLD.batch_id THEN
        RAISE EXCEPTION 'purchase_return_items identity columns are immutable (item %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_return_items_prevent_identity_change
    BEFORE UPDATE ON purchase_return_items
    FOR EACH ROW
    EXECUTE FUNCTION purchase_return_items_prevent_identity_change();

-- lines are editable only while the return is draft; once completed or reversed they are
-- history — mirrors purchase_items_require_open_purchase exactly
CREATE FUNCTION purchase_return_items_require_draft_return() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM purchase_returns
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_return_id ELSE NEW.purchase_return_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'purchase_return_items cannot be changed once the return is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_return_items_require_draft_return
    BEFORE INSERT OR UPDATE OR DELETE ON purchase_return_items
    FOR EACH ROW
    EXECUTE FUNCTION purchase_return_items_require_draft_return();
```

### Notes

- **`reference_type='PURCHASE_RETURN'` resolves to `purchase_return_items.id`**, not `purchase_returns.id`, for both a completion's `PURCHASE_RETURN` movement and a reversal's `PURCHASE_RETURN_REVERSAL` movement — consistent with `PURCHASE_ITEM` already pointing at the *line* (`purchase_items.id`), not the purchase header. A return with three lines against three different batches posts three `PURCHASE_RETURN` movements at completion, one per line; if later reversed, it posts three more `PURCHASE_RETURN_REVERSAL` movements, each still `reference_type='PURCHASE_RETURN'` and `reference_id`=that same line's id. `reference_id` not being unique (see `stock_movements`) is exactly what lets both the original and its reversal point at the same line.
- **Mutable while `draft`, frozen from `completed` onward.** `trg_purchase_return_items_require_draft_return` blocks every insert, update and delete once the parent return leaves `draft` — the same rule `purchase_items_require_open_purchase` already applies to purchase lines while their purchase is `draft`/`ordered`. Within `draft`, `trg_purchase_return_items_prevent_identity_change` still locks which return/purchase item/batch/variant/tenant/store a line points to (change your mind about *which* batch → delete the line and add a new one), but `quantity`, `unit_cost`, `tax_amount` and `line_total` can be adjusted freely, each re-validated by `purchase_return_items_validate` and the `line_total` `CHECK` on every edit. **A draft return has no inventory effect** — no `stock_movements` row exists for a draft item, `available_quantity` is untouched, and nothing here requires one to exist yet (contrast `inventory_batches`, where a batch is invalid without a matching `PURCHASED` movement from the moment it exists — return items are deliberately not held to that bar until they leave draft).
- **The application flow is: validate → build/edit `purchase_return_items` while `draft` → (to complete) `INSERT stock_movements` (`PURCHASE_RETURN`) per item → `UPDATE purchase_returns SET status='completed'` → commit atomically.** `trg_purchase_returns_completion_guard` (see `purchase_returns`) verifies at commit that every item has its matching movement — that's what turns "the app is supposed to insert one movement per item" from a convention into a guarantee. The `stock_movements` insert's existing `trg_stock_movements_apply_to_batch` trigger (see that table) is what actually decrements `inventory_batches.available_quantity`; nothing new was added here for that part. The application must never issue its own `UPDATE` to `available_quantity` — that path is already closed off by the `REVOKE` on that column.
- **"Returned quantity must not exceed available quantity" is enforced the same way an oversell already is: `CHECK (available_quantity >= 0)` on `inventory_batches`, tripped by the same trigger, at completion time.** No new mechanism was needed — a `PURCHASE_RETURN` movement that would take a batch negative fails the whole completion transaction, exactly like an over-sold `SOLD` movement does. Because the check only bites when the movement actually posts (at completion, not at draft-time editing), the application should pre-check `batch.available_quantity` right before completing — a draft item's snapshot of "was there enough stock" can go stale while it sits in draft, so a pre-check at draft-creation time would be advisory at best; the real answer is always "does completion's `CHECK` pass right now."
- **`unit_cost` always matches the batch, at every edit, not just at creation.** `purchase_return_items_validate` re-runs on `UPDATE` too and hard-rejects any value that doesn't exactly equal the referenced batch's own `unit_cost` — there is no "recalculate from today's cost" path, so the credit due back always reflects what was actually paid for that specific batch, consistent with "preserve the original acquisition cost."
- **`tax_amount` is proportional, application-computed, and not independently DB-verified.** Unlike `unit_cost` (a fixed, immutable value with one correct answer), the purchase tax owed back on a *partial* return of a line is `round(purchase_items.tax_amount * quantity / purchase_items.quantity, 2)` — a derived, rounding-sensitive calculation that should be recomputed by the application whenever `quantity` is edited in draft. Per the validation requirements, this is application/service-layer responsibility rather than a rigid `CHECK`, the same way `purchase_items.discount_amount`/`tax_amount` are already "the application computes them" (see that table's notes) rather than DB-derived. **This column is purchase-side tax only** — tax paid to (and credited back by) the supplier. No sales-side tax field exists here or ever will; see `purchase_items`' tax-scoping note, which applies identically to this table.
- **`line_total = round(quantity × unit_cost + tax_amount, 2)`** — the cost of the returned units plus their share of purchase tax, i.e. the credit owed back from the supplier. There is no discount component: Phase 1 returns don't re-open or re-negotiate the original line's discount, they only give back cost and tax on the units actually returned.
- **Auditability is a real, DB-enforced chain, both directions, anchored on the *return header's* status transitions rather than on each item's own insert.** `purchases → purchase_items → inventory_batches → PURCHASED movement` (existing) and `purchases → purchase_items → purchase_returns → purchase_return_items → PURCHASE_RETURN movement → (optionally) PURCHASE_RETURN_REVERSAL movement` (this table, plus `purchase_returns`' completion/reversal guard). A `purchase_return_items` row can exist without a movement (while draft) — that's intentional — but a return cannot *reach* `completed` or `reversed` without every one of its items having the matching movement, which is where the guarantee actually lives.
- **No partial or multi-batch *receiving* is introduced here.** A return always targets one specific, already-existing batch (`batch_id`); nothing about returns creates new batches, splits a purchase item's receipt across several batches, or otherwise touches how goods were originally received.

Example queries:

```sql
-- everything returned against a given purchase, with what it cost to give back
SELECT pr.id AS return_id, pr.return_date, pr.status,
       pri.batch_id, pri.quantity, pri.unit_cost, pri.tax_amount, pri.line_total
  FROM purchase_returns pr
  JOIN purchase_return_items pri ON pri.purchase_return_id = pr.id
 WHERE pr.tenant_id = $1 AND pr.purchase_id = $2
 ORDER BY pr.return_date, pri.created_at;

-- full traceability for one returned batch: receipt, every return, and any reversal
SELECT movement_type, quantity, occurred_at, reference_type, reference_id
  FROM stock_movements
 WHERE tenant_id = $1 AND batch_id = $2
 ORDER BY occurred_at;

-- has this completed return been reversed?
SELECT status FROM purchase_returns WHERE tenant_id = $1 AND id = $2;
-- status = 'reversed' means yes; trg_purchase_returns_guard_update already guarantees
-- it can't be 'reversed' twice, so this single check is authoritative
```

---

## Phase 1: customers, payments and sales

This phase replaces the minimal `sales`/`sale_items` stub an earlier pass introduced (just enough columns to give `customers`/`sale_payments`/`customer_credit_ledger` something to reference) with the real Phase 1 sales transaction design. It also fixes an ordering bug that stub carried: `sales.customer_id` FKs into `customers`, but `customers` was written *after* `sales` in this document — a real problem for anyone reading this top-to-bottom as literal DDL, not just presentation. Tables below are now in dependency order: `customers` → `payment_methods` → `payment_accounts` → `sales` → `sale_items` → `sale_item_batches` → `sale_returns` → `sale_return_items` → `sale_payments` → `customer_credit_ledger`. One genuine *circular* dependency remains, not just an ordering one: `inventory_batches` (documented back in the catalogue/inventory phase, long before this one) can now originate from either a purchase item or a `sale_return_items` row, so its return-side FK is added by a standalone `ALTER TABLE` right after `sale_return_items`, rather than inline in `inventory_batches`' own `CREATE TABLE` — see that table's notes.

```text
Tenant
  └── Store
        ├── Customers (tenant-level; a customer is not store-scoped)
        ├── Payment Methods (tenant-level: HOW — cash, UPI, card, ...)
        ├── Payment Accounts ──► Store (WHERE — a till, a bank account, ...)
        ├── Sales ──► Customer (nullable — guest sales), Store
        │     └── Sale Items ──► Variant
        │           └── Sale Item Batches ──► Inventory Batch (allocation, not FIFO baked in)
        ├── Sale Returns ──► Sale (must be completed)
        │     └── Sale Return Items ──► Sale Item, Sale Item Batch (what's being returned)
        │           └── (creates) Inventory Batch, return-origin ──► Sale Return Item
        ├── Sale Payments ──► Sale, Payment Method, Payment Account (nullable for credit)
        └── Customer Credit Ledger ──► Customer, Sale, Sale Payment (receivable balance)
```

**Conventions used by every table below** — the same ones already established for catalogue/purchasing/inventory, applied unchanged: `tenant_id` explicit on every table for RLS and composite FKs; parents expose `UNIQUE (tenant_id, ...)` targets and children reference them; soft-delete via a terminal or reversible `status`, never `deleted_at`; money is `NUMERIC(12,2)` per unit / `NUMERIC(14,2)` for totals; quantities are `INTEGER`. `sale_payments` and `customer_credit_ledger` are financial ledgers in the exact same sense `stock_movements` is: a completed financial record is corrected by a new, compensating entry, never by editing history. Unlike the first draft of this phase, though, `sale_items`, `sale_item_batches` and `sale_payments` are **not** append-only outright — they're mutable while their parent `sales` row is `draft` and frozen from `completed` onward, the same `draft`-then-frozen idiom `purchase_return_items` already established. That's a real, deliberate change from how `sale_payments` was first built (fully append-only, no draft concept) — see the summary after this edit for why.

---

## `customers`

A tenant-level contact record for a person or business a sale can (optionally) be attributed to. **Not store-scoped** — a customer can appear on sales from any store belonging to the tenant, unlike `sellables`/`variants`, which are store-scoped in Phase 1.

```sql
CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    name                VARCHAR(200) NOT NULL,
    phone               VARCHAR(20),
    email               VARCHAR(255)
                            CONSTRAINT customers_email_lowercase_check
                            CHECK (email = lower(email)),
    address             TEXT,
    notes               TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT customers_status_check
                            CHECK (status IN ('active', 'archived')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- target for sales, customer_credit_ledger
    CONSTRAINT customers_tenant_id_id_unique UNIQUE (tenant_id, id)
);

CREATE INDEX idx_customers_tenant_status ON customers (tenant_id, status);
CREATE INDEX idx_customers_tenant_phone ON customers (tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_tenant_email ON customers (tenant_id, email) WHERE email IS NOT NULL;

CREATE TRIGGER trg_customers_set_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

### Notes

- **No forced uniqueness on `phone`/`email`.** Same reasoning as `users.phone` and `suppliers`' contact fields: a shared household phone, a customer who gives no email, or a duplicate walk-in entry are all real, and forcing uniqueness would block legitimate data rather than catch a real error. `email` still gets the same lowercase-normalisation `CHECK` used everywhere else in this schema (`users.email`, `suppliers.email`) — not for uniqueness, just consistent casing for the (non-unique) lookup index.
- **`status`: `active` / `archived` — the standard terminal soft-delete pattern**, same as `suppliers`. No `deleted_at`. (`sellables` (`active`/`archived`) and `variants` (`active`/`deactivated`) use a similarly-shaped status column, but — unlike this one — theirs is a freely reversible catalogue toggle, not a terminal soft-delete; see those tables' notes.)
- **No `lifetime_purchase_amount`, no `lifetime_discount_amount`, no `credit_balance` column — none, on purpose.** These are exactly the kind of value this schema has consistently refused to store as a mutable, independently-writable fact (the same reasoning `inventory_batches.available_quantity` had to earn its way past in an earlier phase, and here the answer is simpler: nothing earns it). Purchase history is derived from `sales`/`sale_items` (see "Customer purchase history" below); credit balance is derived from `customer_credit_ledger` (see that table's `customer_credit_balance` view). A customer row is identity and contact information only, exactly the same role `users` plays for staff identity versus `tenant_memberships` for their transactional/authorization facts.
- **`address`/`notes` are `TEXT`, not `VARCHAR(500)`** (unlike `reason` fields elsewhere in this schema) — both are open-ended, potentially multi-line content, not a short structured reason code.

---

## `payment_methods`

Represents **HOW** a customer paid — cash, UPI, card, bank transfer, customer credit. Tenant-scoped, and deliberately a real table, not a Postgres `ENUM` type, so a tenant can add or disable a method without a schema migration.

```sql
CREATE TABLE payment_methods (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    name                VARCHAR(100) NOT NULL,
    -- an application-facing constant, e.g. CASH, UPI, CARD, BANK_TRANSFER, CUSTOMER_CREDIT
    code                VARCHAR(30) NOT NULL
                            CONSTRAINT payment_methods_code_format_check
                            CHECK (code = upper(code) AND code ~ '^[A-Z0-9_]+$'),
    -- true for exactly the method(s) representing a customer receivable, not money actually
    -- received into an account — see payment_accounts and sale_payments notes
    is_customer_credit  BOOLEAN NOT NULL DEFAULT false,
    -- reversible toggle, not a terminal archive — see notes
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT payment_methods_status_check
                            CHECK (status IN ('active', 'disabled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- target for sale_payments
    CONSTRAINT payment_methods_tenant_id_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT payment_methods_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX idx_payment_methods_tenant_status ON payment_methods (tenant_id, status);

CREATE TRIGGER trg_payment_methods_set_updated_at
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

### Notes

- **`code` is `UPPER_SNAKE_CASE`, matching this schema's other application-facing constants** (`stock_movements.movement_type`, `.reference_type`) rather than the lowercase-slug convention used for human-chosen identifiers like `stores.code`. The distinction is deliberate: a payment method's `code` is a small, business-meaningful vocabulary the application branches on (`CUSTOMER_CREDIT` in particular has real, different behaviour — see `is_customer_credit`), closer in kind to a `CHECK`-enum value than to a user-typed label, even though it lives in a real, extensible row rather than a fixed `CHECK` list.
- **Extensibility is the whole point of this being a table.** A tenant can add `WALLET` or `GIFT_CARD` by inserting a row, not by an `ALTER TYPE ... ADD VALUE` (a real Postgres `ENUM` migration, and one that can't run inside certain transaction patterns) or a schema migration to widen a `CHECK`. `code`'s format `CHECK` constrains *shape*, not the specific allowed values.
- **`status` is a reversible toggle (`active`/`disabled`), not a terminal archive**, unlike most `status` columns elsewhere in this schema (`sellables.status`, `suppliers.status`, etc., which move one-way toward `archived`). A disabled payment method can be re-enabled — "the tenant should be able to enable/disable payment methods" describes an ordinary settings toggle, not a lifecycle with a point of no return. Historical `sale_payments` rows keep referencing a disabled method just fine (see that table's notes); disabling only affects whether the application offers it for *new* payments.
- **`is_customer_credit`** is what lets exactly one flag drive two related rules downstream (see `sale_payments`): a credit-flagged method doesn't need a real `payment_account` (nothing was actually received into an account — it's a receivable), and using one must produce a matching `customer_credit_ledger` entry. Nothing stops a tenant from having more than one credit-flagged method in principle, but Phase 1's own example expects exactly one (`CUSTOMER_CREDIT`).
- **Seeding default rows (`CASH`, `UPI`, `CARD`, `BANK_TRANSFER`, `CUSTOMER_CREDIT`) for a new tenant is an application/provisioning concern**, not a schema one — this document has never included seed-data `INSERT`s, staying schema-only throughout, and this table is no exception.

---

## `payment_accounts`

Represents **WHERE** the business actually receives or holds money — a till, a bank account, a card settlement account. Store-scoped, unlike `payment_methods`.

```sql
CREATE TABLE payment_accounts (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    -- a short, user-chosen internal label — same convention as stores.code, unlike
    -- payment_methods.code (see that table's notes for why the two conventions differ)
    code                VARCHAR(50) NOT NULL
                            CONSTRAINT payment_accounts_code_lowercase_check
                            CHECK (code = lower(code) AND code ~ '^[a-z0-9-]+$'),
    -- reversible toggle, same semantics as payment_methods.status
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT payment_accounts_status_check
                            CHECK (status IN ('active', 'disabled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- target for sale_payments
    CONSTRAINT payment_accounts_tenant_store_id_unique UNIQUE (tenant_id, store_id, id),
    CONSTRAINT payment_accounts_tenant_store_code_unique UNIQUE (tenant_id, store_id, code),
    CONSTRAINT payment_accounts_store_fk
        FOREIGN KEY (tenant_id, store_id) REFERENCES stores (tenant_id, id)
);

CREATE INDEX idx_payment_accounts_store_status ON payment_accounts (tenant_id, store_id, status);

CREATE TRIGGER trg_payment_accounts_set_updated_at
    BEFORE UPDATE ON payment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

### Notes

- **No credentials, ever.** No account number, no card/UPI provider secret, no API key or token — this table is a *label* for a receiving destination ("HDFC Current Account"), not an integration or a vault. Any real payment-gateway or banking credential belongs in a secrets manager or a narrowly access-controlled table well outside general schema documentation, never here.
- **`code` uniqueness is scoped to `(tenant_id, store_id, code)`, not tenant-wide** — deliberately allowing the *same* code at two different stores (e.g. every store having its own `cash-drawer` account), because Phase 1 does not model one payment account being shared across multiple stores; each store gets its own row even for what is conceptually the same bank account. This is the same single-store-at-a-time simplification the rest of Phase 1 already accepts (see "Schema capability vs. Phase 1 workflow" in the purchasing/inventory phase) — a genuinely shared multi-store account is future work, not a Phase 1 gap being newly introduced here.
- **Disabling never breaks history.** `status = 'disabled'` only affects whether new `sale_payments` may be posted against it going forward (an application-level check, since nothing here blocks a `disabled` account from still being a valid FK target); existing `sale_payments` rows keep their FK regardless.

---

## `sales`

One sale transaction at a store, optionally tied to a customer (**`stores 1:N sales`**, **`customers 1:N sales`**, nullable).

```sql
CREATE TABLE sales (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    -- nullable: guest/anonymous sales are supported, no fake customer row is created for them
    customer_id         UUID,
    -- assigned by the application, typically only once the sale completes — see notes
    sale_number         VARCHAR(50),
    -- business time of the sale (TIMESTAMPTZ, not just DATE — a POS transaction has an
    -- exact moment, unlike purchases.purchase_date which only needed day granularity)
    sold_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    subtotal_amount     NUMERIC(14,2) NOT NULL DEFAULT 0
                            CONSTRAINT sales_subtotal_check CHECK (subtotal_amount >= 0),
    discount_amount     NUMERIC(14,2) NOT NULL DEFAULT 0
                            CONSTRAINT sales_discount_check CHECK (discount_amount >= 0),
    -- sales-side tax, kept separate from purchase-side tax — see purchase_items' tax-scoping note
    tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0
                            CONSTRAINT sales_tax_check CHECK (tax_amount >= 0),
    total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0
                            CONSTRAINT sales_total_check CHECK (total_amount >= 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CONSTRAINT sales_status_check
                            CHECK (status IN ('draft', 'completed', 'voided')),
    -- free text, not an enum — why a sale was voided doesn't need to drive any logic,
    -- just be visible to a human auditing the sale later
    void_reason         TEXT,
    created_by          UUID NOT NULL REFERENCES users (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sales_total_amount_check
        CHECK (total_amount = subtotal_amount - discount_amount + tax_amount),
    -- can only be set once the sale is actually voided
    CONSTRAINT sales_void_reason_pair_check
        CHECK (status = 'voided' OR void_reason IS NULL),

    -- target for sale_items, sale_payments and customer_credit_ledger
    CONSTRAINT sales_tenant_store_id_unique UNIQUE (tenant_id, store_id, id),
    CONSTRAINT sales_store_fk
        FOREIGN KEY (tenant_id, store_id) REFERENCES stores (tenant_id, id),
    -- MATCH SIMPLE (the default): a NULL customer_id skips this check entirely,
    -- which is exactly what a guest sale needs
    CONSTRAINT sales_customer_fk
        FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)
);

-- a sale_number, once assigned, is never reused — even by a later voided sale. Unlike
-- purchases' cancelled-invoice-number reuse, a completed (even later voided) sale had a
-- real receipt already issued to a customer; draft sales won't have one yet, so this is
-- effectively "unique from the moment it's assigned, forever"
CREATE UNIQUE INDEX idx_sales_tenant_store_number_unique
    ON sales (tenant_id, store_id, sale_number)
    WHERE sale_number IS NOT NULL;

CREATE INDEX idx_sales_store_sold_at ON sales (tenant_id, store_id, sold_at DESC);
CREATE INDEX idx_sales_customer ON sales (tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_sales_status ON sales (tenant_id, store_id, status);

CREATE TRIGGER trg_sales_set_updated_at
    BEFORE UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- tenant/store never change; status only moves draft -> completed -> voided; once a sale
-- is no longer draft, its commercial identity (who, when, what receipt number) is frozen
-- too — only status itself may still move, to voided
CREATE FUNCTION sales_guard_update() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id THEN
        RAISE EXCEPTION 'sales tenant_id and store_id are immutable (sale %)', OLD.id;
    END IF;
    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'draft'     AND NEW.status = 'completed')
            OR (OLD.status = 'completed' AND NEW.status = 'voided')
        ) THEN
            RAISE EXCEPTION 'sale % cannot go from % to %', OLD.id, OLD.status, NEW.status;
        END IF;
        -- voiding restores the FULL originally-sold quantity via SOLD_REVERSAL; a completed
        -- sale_return has already restored part (or all) of it via its own return batch, so
        -- allowing both would double-count stock. See sale_returns for the other half of
        -- this guard (a return cannot complete against a sale that is no longer completed)
        IF OLD.status = 'completed' AND NEW.status = 'voided'
           AND EXISTS (SELECT 1 FROM sale_returns WHERE sale_id = OLD.id AND status = 'completed') THEN
            RAISE EXCEPTION 'sale % has a completed sale_return and cannot be voided', OLD.id;
        END IF;
    END IF;
    IF OLD.status <> 'draft' AND (
        NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.sale_number IS DISTINCT FROM OLD.sale_number
        OR NEW.sold_at <> OLD.sold_at
    ) THEN
        RAISE EXCEPTION 'sale % is % and its commercial details are immutable', OLD.id, OLD.status;
    END IF;
    -- void_reason may only be set by the completed -> voided transition itself,
    -- and is frozen forever after that (voided is already terminal, but this
    -- also blocks setting it early on a still-draft/completed row)
    IF NEW.void_reason IS DISTINCT FROM OLD.void_reason
       AND NOT (OLD.status = 'completed' AND NEW.status = 'voided') THEN
        RAISE EXCEPTION 'sale % void_reason can only be set when voiding the sale', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sales_guard_update
    BEFORE UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION sales_guard_update();

-- header totals must equal the sum of the lines (checked at commit, see sale_items) —
-- this is also what keeps subtotal/discount/tax/total from drifting after sale_items
-- freeze at completion: any attempt to edit them independently no longer matches the
-- (now-frozen) lines and fails here, so no separate "lock the money columns" rule is needed
CREATE FUNCTION check_sale_totals(p_sale_id UUID) RETURNS VOID AS $$
DECLARE
    s      sales%ROWTYPE;
    v_sub  NUMERIC;
    v_disc NUMERIC;
    v_tax  NUMERIC;
BEGIN
    SELECT * INTO s FROM sales WHERE id = p_sale_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(round(quantity * unit_price, 2)), 0),
           COALESCE(SUM(discount_amount), 0),
           COALESCE(SUM(tax_amount), 0)
      INTO v_sub, v_disc, v_tax
      FROM sale_items
     WHERE sale_id = p_sale_id;

    IF s.subtotal_amount <> v_sub OR s.discount_amount <> v_disc OR s.tax_amount <> v_tax THEN
        RAISE EXCEPTION 'sale % header totals do not match its line items', p_sale_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION trg_fn_sale_totals_guard() RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'sales' THEN
        PERFORM check_sale_totals(NEW.id);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM check_sale_totals(OLD.sale_id);
    ELSE
        PERFORM check_sale_totals(NEW.sale_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_sales_totals_guard
    AFTER INSERT OR UPDATE ON sales
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_sale_totals_guard();

-- shared by the completion and void guards below: does every sale_item_batches
-- allocation on this sale already have the matching stock_movements row?
CREATE FUNCTION check_sale_item_batch_movements(
    p_sale_id UUID, p_expected_movement_type VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_missing INTEGER;
BEGIN
    SELECT count(*) INTO v_missing
      FROM sale_item_batches sib
      JOIN sale_items si ON si.id = sib.sale_item_id
     WHERE si.sale_id = p_sale_id
       AND NOT EXISTS (
           SELECT 1 FROM stock_movements sm
            WHERE sm.batch_id = sib.batch_id
              AND sm.movement_type = p_expected_movement_type
              AND sm.reference_type = 'SALE_ITEM'
              AND sm.reference_id = sib.sale_item_id
              AND sm.quantity = sib.quantity
       );

    IF v_missing > 0 THEN
        RAISE EXCEPTION 'sale % is missing % stock movement(s) of type % for its batch allocations',
            p_sale_id, v_missing, p_expected_movement_type;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- checked at commit: everything a draft->completed or completed->voided transition
-- requires must already be true by the time this fires, in whatever order the
-- application posted the supporting rows
CREATE FUNCTION trg_fn_sales_completion_guard() RETURNS TRIGGER AS $$
DECLARE
    v_unallocated INTEGER;
    v_paid        NUMERIC(14,2);
BEGIN
    IF NEW.status = 'completed' AND OLD.status = 'draft' THEN
        IF NOT EXISTS (SELECT 1 FROM sale_items WHERE sale_id = NEW.id) THEN
            RAISE EXCEPTION 'sale % has no items to complete', NEW.id;
        END IF;

        -- every sale item must be fully allocated to batches: sum(allocations) = quantity
        SELECT count(*) INTO v_unallocated
          FROM sale_items si
         WHERE si.sale_id = NEW.id
           AND si.quantity <> COALESCE(
               (SELECT SUM(sib.quantity) FROM sale_item_batches sib
                 WHERE sib.sale_item_id = si.id), 0);

        IF v_unallocated > 0 THEN
            RAISE EXCEPTION 'sale % has % item(s) not fully allocated to batches', NEW.id, v_unallocated;
        END IF;

        PERFORM check_sale_item_batch_movements(NEW.id, 'SOLD');

        -- payments must sum exactly to the sale total: no unexplained underpayment,
        -- customer credit counts because it is itself a sale_payments row
        SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sale_payments WHERE sale_id = NEW.id;
        IF v_paid <> NEW.total_amount THEN
            RAISE EXCEPTION 'sale % payments (%) do not equal its total (%)',
                NEW.id, v_paid, NEW.total_amount;
        END IF;

        -- every customer-credit payment must have produced a CREDIT_SALE ledger entry
        IF EXISTS (
            SELECT 1 FROM sale_payments sp
              JOIN payment_methods pm ON pm.id = sp.payment_method_id AND pm.tenant_id = sp.tenant_id
             WHERE sp.sale_id = NEW.id AND pm.is_customer_credit
               AND NOT EXISTS (
                   SELECT 1 FROM customer_credit_ledger ccl
                    WHERE ccl.sale_payment_id = sp.id AND ccl.entry_type = 'CREDIT_SALE'
               )
        ) THEN
            RAISE EXCEPTION 'sale % has a customer-credit payment with no matching CREDIT_SALE ledger entry', NEW.id;
        END IF;

    ELSIF NEW.status = 'voided' AND OLD.status = 'completed' THEN
        -- every batch allocation must have a compensating SOLD_REVERSAL movement,
        -- restoring exactly what was sold
        PERFORM check_sale_item_batch_movements(NEW.id, 'SOLD_REVERSAL');

        -- every CREDIT_SALE tied to this sale must have a matching CREDIT_REVERSAL
        IF EXISTS (
            SELECT 1 FROM customer_credit_ledger ccl
             WHERE ccl.sale_id = NEW.id AND ccl.entry_type = 'CREDIT_SALE'
               AND NOT EXISTS (
                   SELECT 1 FROM customer_credit_ledger rev
                    WHERE rev.reverses_entry_id = ccl.id AND rev.entry_type = 'CREDIT_REVERSAL'
               )
        ) THEN
            RAISE EXCEPTION 'sale % has a CREDIT_SALE entry with no matching CREDIT_REVERSAL', NEW.id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_sales_completion_guard
    AFTER UPDATE ON sales
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_sales_completion_guard();
```

### Notes

- **Lifecycle: `draft` → `completed` → `voided`, each edge one-way, enforced edge by edge** — same idiom as `purchases`/`purchase_returns`. `draft`: freely editable, zero permanent effect (no stock movement, no `available_quantity` change, no ledger entry). `completed`: `trg_sales_completion_guard` verifies, at commit, that every item is fully batch-allocated, every allocation has its `SOLD` movement, payments sum exactly to the total, and every customer-credit payment produced its ledger entry — only then does the transition actually land. `voided`: the mirror image, requiring compensating `SOLD_REVERSAL` movements and `CREDIT_REVERSAL` entries for everything the completion created. `voided` is terminal.
- **A sale with a completed `sale_return` can no longer be voided.** Voiding restores the *full* originally-sold quantity via `SOLD_REVERSAL`; a completed return has already restored part or all of that same quantity via its own return batch (see `sale_returns`), so allowing both would double-count stock. `sales_guard_update()` blocks the `completed → voided` edge in that case. Symmetrically, `sale_returns`' own completion guard re-checks (at commit, not just at draft creation) that the sale is *still* `completed` — a sale can still be voided after a return is only drafted against it, since a draft has no stock effect to conflict with.
- **`sale_number` is assigned by the application, typically at completion, not at draft creation** — a cart being built doesn't need a receipt number yet. It stays permanently unique once assigned (see the index comment) even through a later void, because voiding never un-issues a receipt that already went to a customer.
- **`created_by` names who created the sale record**, not necessarily who completed or voided it — Phase 1 doesn't track a per-transition actor on `sales` itself, the same simplification already accepted on `purchase_returns.created_by`. The `stock_movements` and `customer_credit_ledger` rows posted at completion/void carry their own `created_by`, which is where finer-grained attribution actually lives.
- **`void_reason` is nullable free text, not an enum** — a voided sale is an operational/audit event worth a human-readable reason, but Phase 1 has no use for the reason as structured data (no reporting or workflow keys off it), so an enum would just be a second thing to keep in sync for no behavioral payoff. `sales_void_reason_pair_check` requires it to be `NULL` on every non-voided row, and `sales_guard_update()` only allows it to be set in the same `UPDATE` that performs the `completed -> voided` transition — it can't be pre-filled on a draft/completed sale, and once set it's frozen (voided is already terminal).

Example queries:

```sql
-- everything on a completed sale: lines, their batch allocations, and how it was paid
SELECT si.variant_id, si.quantity, si.unit_price, si.line_total,
       sib.batch_id, sib.quantity AS allocated_quantity
  FROM sale_items si
  JOIN sale_item_batches sib ON sib.sale_item_id = si.id
 WHERE si.tenant_id = $1 AND si.sale_id = $2;

-- full audit trail for a sale, across both the ledger and the credit ledger
SELECT 'stock' AS kind, movement_type AS entry_type, quantity AS amount, occurred_at AS at
  FROM stock_movements
 WHERE tenant_id = $1 AND reference_type = 'SALE_ITEM'
   AND reference_id IN (SELECT id FROM sale_items WHERE sale_id = $2)
UNION ALL
SELECT 'credit', entry_type, amount, created_at
  FROM customer_credit_ledger
 WHERE tenant_id = $1 AND sale_id = $2
 ORDER BY at;
```

---

## `sale_items`

One row per variant being sold — a commercial line, not a physical-stock line (**`sales 1:N sale_items`**, **`variants 1:N sale_items`**). Mutable while its parent `sales.status = 'draft'`, frozen from `completed` onward — same idiom `purchase_return_items` already established.

```sql
CREATE TABLE sale_items (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    sale_id             UUID NOT NULL,
    variant_id          UUID NOT NULL,
    quantity            INTEGER NOT NULL
                            CONSTRAINT sale_items_quantity_check CHECK (quantity > 0),
    -- captured at time of sale from variants.base_price; never recalculated from the
    -- variant's current price later — see notes
    unit_price          NUMERIC(12,2) NOT NULL
                            CONSTRAINT sale_items_unit_price_check CHECK (unit_price >= 0),
    discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0
                            CONSTRAINT sale_items_discount_check CHECK (discount_amount >= 0),
    -- sales tax collected from the customer — see purchase_items' tax-scoping note, which
    -- anticipated exactly this column before sale_items existed to hold it
    tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0
                            CONSTRAINT sale_items_tax_check CHECK (tax_amount >= 0),
    line_total          NUMERIC(14,2) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sale_items_line_total_check
        CHECK (line_total = round(quantity * unit_price - discount_amount + tax_amount, 2)),

    -- target for sale_item_batches
    CONSTRAINT sale_items_batch_target_unique
        UNIQUE (tenant_id, store_id, id, variant_id),
    CONSTRAINT sale_items_sale_fk
        FOREIGN KEY (tenant_id, store_id, sale_id) REFERENCES sales (tenant_id, store_id, id),
    CONSTRAINT sale_items_variant_fk
        FOREIGN KEY (tenant_id, variant_id) REFERENCES variants (tenant_id, id)
);

CREATE INDEX idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX idx_sale_items_variant ON sale_items (tenant_id, variant_id);

CREATE TRIGGER trg_sale_items_set_updated_at
    BEFORE UPDATE ON sale_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- lines are editable only while the sale is draft; once completed or voided they are
-- history — mirrors purchase_items_require_open_purchase exactly
CREATE FUNCTION sale_items_require_draft_sale() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM sales
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'sale_items cannot be changed once the sale is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_items_require_draft_sale
    BEFORE INSERT OR UPDATE OR DELETE ON sale_items
    FOR EACH ROW
    EXECUTE FUNCTION sale_items_require_draft_sale();

-- tenant/store/sale never change (fixing a wrong variant is allowed while still draft,
-- same latitude purchase_items already gives its own variant_id)
CREATE FUNCTION sale_items_prevent_parent_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id
       OR NEW.sale_id <> OLD.sale_id THEN
        RAISE EXCEPTION 'sale_items tenant_id, store_id and sale_id are immutable (item %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_items_prevent_parent_change
    BEFORE UPDATE ON sale_items
    FOR EACH ROW
    EXECUTE FUNCTION sale_items_prevent_parent_change();

-- the sales-eligibility rule: a variant can be added to a sale only when BOTH it and its
-- parent sellable are active. Fires on INSERT (adding a line) and whenever variant_id itself
-- changes (fixing a wrong variant while still draft) — never on any other UPDATE, since every
-- other content column's own trigger already restricts changes to draft anyway
CREATE FUNCTION sale_items_require_active_variant() RETURNS TRIGGER AS $$
DECLARE
    v_variant_status  VARCHAR(20);
    v_sellable_status VARCHAR(20);
BEGIN
    SELECT v.status, s.status INTO v_variant_status, v_sellable_status
      FROM variants v
      JOIN sellables s ON s.id = v.sellable_id AND s.tenant_id = v.tenant_id
     WHERE v.id = NEW.variant_id AND v.tenant_id = NEW.tenant_id;

    IF v_variant_status <> 'active' THEN
        RAISE EXCEPTION 'variant % is % and cannot be sold', NEW.variant_id, v_variant_status;
    END IF;
    IF v_sellable_status <> 'active' THEN
        RAISE EXCEPTION 'variant % belongs to a % sellable and cannot be sold', NEW.variant_id, v_sellable_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_items_require_active_variant
    BEFORE INSERT OR UPDATE OF variant_id ON sale_items
    FOR EACH ROW
    EXECUTE FUNCTION sale_items_require_active_variant();

-- the variant must belong to the same store as the sale itself — the sales-side mirror of
-- purchase_items_validate_variant's store check. Fires only on INSERT and on a variant_id
-- change, not on every UPDATE: store_id itself is already immutable on this table
-- (sale_items_prevent_parent_change), so a mismatch can only ever be introduced by naming
-- a different variant, never by store_id moving to meet one
CREATE FUNCTION sale_items_validate_variant_store() RETURNS TRIGGER AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT store_id INTO v_store_id
      FROM variants
     WHERE id = NEW.variant_id AND tenant_id = NEW.tenant_id;

    IF v_store_id IS DISTINCT FROM NEW.store_id THEN
        RAISE EXCEPTION 'variant % does not belong to store %', NEW.variant_id, NEW.store_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_items_validate_variant_store
    BEFORE INSERT OR UPDATE OF variant_id ON sale_items
    FOR EACH ROW
    EXECUTE FUNCTION sale_items_validate_variant_store();

-- any line change re-verifies the header totals at commit
CREATE CONSTRAINT TRIGGER trg_sale_items_totals_guard
    AFTER INSERT OR UPDATE OR DELETE ON sale_items
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_sale_totals_guard();
```

### Notes

- **`unit_price` is captured once, at the time of sale, and never recomputed from `variants.base_price` later.** There is no FK-driven or trigger-driven refresh — the column is simply written once (by the application, reading the variant's current price at add-to-cart time) and, like every other content column here, only editable while the sale is still `draft`. A later change to `variants.base_price` never touches a historical (or even in-progress) sale.
- **A sale item does not, by itself, name a batch.** `variant_id` is the commercial unit being sold; *which physical stock* fulfils it is `sale_item_batches`' job (next table), deliberately kept separate so the allocation strategy (barcode-exact, FIFO, future FEFO) never has to live on this table — see that table's notes and "Future FEFO compatibility" below.
- **No discount/tax *rate* fields**, same reasoning as `purchase_items`/`purchase_return_items`: these are absolute amounts, computed by the application, not percentages stored and reproduced here.
- **`line_total = round(quantity × unit_price − discount + tax, 2)`** — gross line amount (`quantity × unit_price`) minus discount plus sales tax, the same shape `purchase_items.line_total` uses (minus the direction of tax's sign, since purchase tax and sales tax are unrelated concepts that happen to both get added here — see `purchase_items`' tax-scoping note).
- **`trg_sale_items_require_active_variant` is what actually enforces "archived/deactivated can't be sold," for both selling flows at once.** Barcode-first and variant-first selling both end up inserting a `sale_items` row for the commercial line before (or as) they insert its `sale_item_batches` allocation, so one trigger here covers a scanned barcode exactly the same as a variant search — there's no second check needed on `sale_item_batches` or on the barcode-lookup path. It fires on `INSERT` and on a `variant_id` change, never on any other `UPDATE` — `quantity`/`unit_price`/etc. changing doesn't re-name a variant, so there's nothing new to check. It's deliberately silent about `sale_return_items`: a return must always be acceptable against a variant or sellable that's since been deactivated or archived, the same "never break history" principle "Historical integrity" already establishes — Phase 1 has no analogous eligibility check anywhere on the return path, by design.
- **Purchasing is untouched.** Nothing stops `purchase_items` from naming a deactivated variant or an archived sellable's variant — receiving already-ordered stock, or restocking a variant you're about to reactivate, is a purchasing concern, not a sales-eligibility one, and this phase's eligibility rule was scoped to selling only.
- **`trg_sale_items_validate_variant_store` closes an asymmetry with `purchase_items`, which has always had this check (`purchase_items_validate_variant`) and `sale_items` never did.** Both `sale_items_variant_fk` and `purchase_items_variant_fk` only tie `(tenant_id, variant_id)` back to `variants` — neither includes `store_id`, so neither FK by itself can catch a line naming a variant from a different store in the same tenant. `purchase_items` always closed that gap with its own trigger; before this fix, a mismatched `sale_items` row wasn't rejected at insert time at all — it would simply sit there, unable to ever be fulfilled (`sale_item_batches_batch_fk` can never find an `inventory_batches` row under the *wrong* store for that variant, since batches only ever exist under a variant's real store), surfacing much later as a confusing FK error or a sale stuck forever unable to complete. This trigger gives the same immediate, clear rejection `purchase_items` already gave.

---

## `sale_item_batches`

Which physical batch(es) fulfil a sale item — the batch-allocation layer requirement 4 asked for, kept deliberately separate from `sale_items` so the allocation *strategy* never has to be hardcoded into the commercial line (**`sale_items 1:N sale_item_batches`**, **`inventory_batches 1:N sale_item_batches`**). Mutable while `draft`, frozen from `completed` onward, same idiom as `sale_items`.

```sql
CREATE TABLE sale_item_batches (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    variant_id          UUID NOT NULL,
    sale_item_id        UUID NOT NULL,
    batch_id            UUID NOT NULL,
    quantity            INTEGER NOT NULL
                            CONSTRAINT sale_item_batches_quantity_check CHECK (quantity > 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- the sale item this allocation belongs to: tenant, store AND variant must all agree
    CONSTRAINT sale_item_batches_sale_item_fk
        FOREIGN KEY (tenant_id, store_id, sale_item_id, variant_id)
        REFERENCES sale_items (tenant_id, store_id, id, variant_id),
    -- the batch being drawn from: tenant, store AND variant must all agree
    CONSTRAINT sale_item_batches_batch_fk
        FOREIGN KEY (tenant_id, store_id, batch_id, variant_id)
        REFERENCES inventory_batches (tenant_id, store_id, id, variant_id),

    -- target for sale_return_items: a return line must agree with the original allocation
    -- it's returning from on tenant, store, sale_item AND variant
    CONSTRAINT sale_item_batches_return_target_unique
        UNIQUE (tenant_id, store_id, id, sale_item_id, variant_id)
);

CREATE INDEX idx_sale_item_batches_sale_item ON sale_item_batches (sale_item_id);
CREATE INDEX idx_sale_item_batches_batch ON sale_item_batches (tenant_id, store_id, batch_id);

CREATE TRIGGER trg_sale_item_batches_set_updated_at
    BEFORE UPDATE ON sale_item_batches
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- editable only while the parent sale is draft — mirrors sale_items exactly, one join further
CREATE FUNCTION sale_item_batches_require_draft_sale() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT s.status INTO v_status
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
     WHERE si.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_item_id ELSE NEW.sale_item_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'sale_item_batches cannot be changed once the sale is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_item_batches_require_draft_sale
    BEFORE INSERT OR UPDATE OR DELETE ON sale_item_batches
    FOR EACH ROW
    EXECUTE FUNCTION sale_item_batches_require_draft_sale();

CREATE FUNCTION sale_item_batches_prevent_identity_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id
       OR NEW.variant_id <> OLD.variant_id OR NEW.sale_item_id <> OLD.sale_item_id
       OR NEW.batch_id <> OLD.batch_id THEN
        RAISE EXCEPTION 'sale_item_batches identity columns are immutable (allocation %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_item_batches_prevent_identity_change
    BEFORE UPDATE ON sale_item_batches
    FOR EACH ROW
    EXECUTE FUNCTION sale_item_batches_prevent_identity_change();

-- checked at commit of any allocation change: allocations for one sale item may not
-- exceed its quantity. Equality is required only at sale completion (see sales) — while
-- draft, a partially-allocated (or unallocated) item is normal, still-being-built state
CREATE FUNCTION trg_fn_sale_item_batches_allocation_guard() RETURNS TRIGGER AS $$
DECLARE
    v_sale_item_id UUID;
    v_quantity     INTEGER;
    v_allocated    INTEGER;
BEGIN
    v_sale_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_item_id ELSE NEW.sale_item_id END;

    SELECT quantity INTO v_quantity FROM sale_items WHERE id = v_sale_item_id;

    SELECT COALESCE(SUM(quantity), 0) INTO v_allocated
      FROM sale_item_batches WHERE sale_item_id = v_sale_item_id;

    IF v_allocated > v_quantity THEN
        RAISE EXCEPTION 'sale item % batch allocations (%) exceed its quantity (%)',
            v_sale_item_id, v_allocated, v_quantity;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_sale_item_batches_allocation_guard
    AFTER INSERT OR UPDATE OR DELETE ON sale_item_batches
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_sale_item_batches_allocation_guard();
```

### Notes

- **This table is allocation-strategy-agnostic, on purpose (requirement 7).** Nothing here records *why* a row names the batch it does — a barcode scan and a FIFO decision produce the exact same shape of row. **Barcode-first selling**: the cashier scans a batch's barcode, the application resolves it straight to `inventory_batches.id` (see that table's barcode notes), and writes one `sale_item_batches` row naming that exact batch — no FIFO, no substitution; the scanned batch is what gets consumed. **Variant-first selling**: the application looks up eligible batches for the variant/store, orders them (FIFO today — oldest `inventory_batches.received_at` first — FEFO later once expiry-enabled inventory exists), and writes one row per batch it draws from until the sale item's quantity is covered, continuing across batches if one isn't enough. The allocation *strategy* lives entirely in application/service-layer code; this table just records the *result*, which is exactly what lets FIFO become FEFO later without touching this schema.
- **A single sale item may span several batches** (`Red Saree × 7` as `B001 → 5` + `B002 → 2`) — the commercial line stays one `sale_items` row with `quantity = 7`; the physical fulfilment is two `sale_item_batches` rows. Symmetrically, one batch can appear across many `sale_item_batches` rows over time, on different sales, as long as there's `available_quantity` left — nothing here restricts a batch to a single sale.
- **Sum-must-equal-quantity is checked at completion, not continuously during draft** (see `sales`' completion guard) — a draft cart is allowed to be partially or not-yet allocated. What *is* checked continuously, at every allocation change, is the ceiling: allocations for one sale item can never exceed its quantity, so an over-allocation mistake is caught immediately rather than surfacing only at completion.
- **No `available_quantity` check happens here.** A draft-time snapshot of "is there enough stock" would go stale the moment another concurrent sale touches the same batch — see "Concurrency and stock safety" below. The real, authoritative check is the same one every other decreasing movement already relies on: `CHECK (available_quantity >= 0)` on `inventory_batches`, tripped when the `SOLD` movement actually posts at completion. The application should still pre-check for a good error message, per the pattern already established under `stock_movements`.

---

## Concurrency and stock safety

Two concurrent sales must not be able to oversell the same batch — this is not a new mechanism, it is the existing `stock_movements` → `inventory_batches.available_quantity` machinery (see that table and `stock_movements`), reused exactly as-is:

- Posting a `SOLD` `stock_movements` row for a batch allocation runs `trg_stock_movements_apply_to_batch`, which issues a plain `UPDATE inventory_batches SET available_quantity = available_quantity - quantity WHERE id = ...`. That `UPDATE` takes an ordinary Postgres row lock on the batch for the rest of the transaction — a second, concurrent sale trying to consume the same batch blocks at its own `UPDATE` until the first transaction commits or rolls back, then re-reads the now-current `available_quantity` before applying its own delta. There is no read-then-write race window; row-level locking on a plain `UPDATE` already provides it.
- `CHECK (available_quantity >= 0)` is what actually stops the oversell: if the second (now-serialized) sale's `SOLD` movement would take the batch negative, its whole completion transaction fails — every `SOLD` movement posted for that sale in that transaction rolls back too, exactly the "if any allocation fails, the entire completion transaction must fail" requirement.
- **No explicit `SELECT ... FOR UPDATE` is needed for *this specific* oversell check.** The `UPDATE` inside the trigger *is* the lock; adding an explicit row lock beforehand would be redundant with a mechanism that already exists. This is specific to checks expressed as an `UPDATE` against a single counter column (`available_quantity`) — a check expressed instead as a fresh aggregate `SELECT` over sibling rows, with no counter column to take a lock through, needs its own explicit lock. `sale_returns`' over-return ceiling is exactly that second shape, and does take one — see that table's notes.
- The application is still responsible for the transaction boundary: every `SOLD` movement for a sale's batch allocations, plus the `draft → completed` status flip, belongs in one transaction, so a failure partway through (insufficient stock on the third of four allocations, say) leaves nothing committed — no partial sale, no partially-decremented batches.

---

## Sale calculation

How a line becomes a total, stated once, plainly (requirement 14):

```text
Per line:   quantity × unit_price        → gross line amount
            − discount_amount + tax_amount → sale_items.line_total

Per sale:   SUM(sale_items, grouped the same way check_sale_totals groups them)
              → sales.subtotal_amount / discount_amount / tax_amount
            subtotal_amount − discount_amount + tax_amount → sales.total_amount
```

Every amount at every step is an absolute currency value — no percentage/rate field exists anywhere in this chain, matching `purchase_items`' and `purchase_return_items`' conventions exactly. `check_sale_totals` (see `sales`) is what turns the "per sale" row above from a suggestion into an enforced invariant, the same deferred-trigger idiom `purchases`/`purchase_items` already use for their own totals.

---

## `sale_returns`

A customer physically returning previously purchased goods (**`sales 1:N sale_returns`**) — distinct from a cashier *voiding* an erroneous transaction, which `sales`' own `voided` status already handles (see that table's notes, and `stock_movements`' `SOLD_REVERSAL` vs. `SALE_RETURN` note). A return always originates from an existing `completed` sale; there is no independent "customer purchase history" table — `sales` → `sale_items` → `sale_item_batches` already give the original customer, store, sale date, totals, variants, quantities, prices and batch allocations, and this table only ever points back at them, never duplicates them.

```sql
CREATE TABLE sale_returns (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    sale_id             UUID NOT NULL,
    -- assigned by the application, typically only once the return completes — mirrors
    -- sales.sale_number exactly, including staying nullable through draft
    return_number       VARCHAR(50),
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CONSTRAINT sale_returns_status_check
                            CHECK (status IN ('draft', 'completed')),
    reason              VARCHAR(500),
    created_by          UUID NOT NULL REFERENCES users (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- target for sale_return_items
    CONSTRAINT sale_returns_tenant_store_id_unique UNIQUE (tenant_id, store_id, id),
    -- tenant AND store must match the original sale
    CONSTRAINT sale_returns_sale_fk
        FOREIGN KEY (tenant_id, store_id, sale_id)
        REFERENCES sales (tenant_id, store_id, id)
);

-- a return_number, once assigned, is unique within its store. No permanent-uniqueness-after-
-- terminal-status concern the way sales.sale_number has after voiding — Phase 1 has no
-- reversal state for a return (see notes), so 'completed' really is the end of the line
CREATE UNIQUE INDEX idx_sale_returns_tenant_store_number_unique
    ON sale_returns (tenant_id, store_id, return_number)
    WHERE return_number IS NOT NULL;

CREATE INDEX idx_sale_returns_sale ON sale_returns (tenant_id, sale_id);
CREATE INDEX idx_sale_returns_store_created ON sale_returns (tenant_id, store_id, created_at DESC);
CREATE INDEX idx_sale_returns_status ON sale_returns (tenant_id, store_id, status);

CREATE TRIGGER trg_sale_returns_set_updated_at
    BEFORE UPDATE ON sale_returns
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- tenant/store/sale never change; status only moves draft -> completed. 'completed' is
-- terminal here — there is no 'reversed' edge (return reversal is explicitly out of Phase 1
-- scope, unlike purchase_returns, which does have one)
CREATE FUNCTION sale_returns_guard_update() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.store_id <> OLD.store_id
       OR NEW.sale_id <> OLD.sale_id THEN
        RAISE EXCEPTION 'sale_returns tenant_id, store_id and sale_id are immutable (return %)', OLD.id;
    END IF;
    IF NEW.status <> OLD.status AND NOT (OLD.status = 'draft' AND NEW.status = 'completed') THEN
        RAISE EXCEPTION 'sale_return % cannot go from % to %', OLD.id, OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_returns_guard_update
    BEFORE UPDATE ON sale_returns
    FOR EACH ROW
    EXECUTE FUNCTION sale_returns_guard_update();

-- a return may only be drafted against a sale that is completed at that moment — same
-- "check once, at draft creation" idiom purchase_returns uses against purchases. Unlike a
-- received purchase, though, a completed sale is NOT terminal (it can still be voided), so
-- this alone is not enough: trg_fn_sale_returns_completion_guard below re-checks at commit
CREATE FUNCTION sale_returns_require_completed_sale() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status FROM sales WHERE id = NEW.sale_id;

    IF v_status <> 'completed' THEN
        RAISE EXCEPTION 'sale % is % and is not eligible for a return', NEW.sale_id, v_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_returns_require_completed_sale
    BEFORE INSERT ON sale_returns
    FOR EACH ROW
    EXECUTE FUNCTION sale_returns_require_completed_sale();

-- checked at commit of the draft -> completed transition: everything a completed return
-- requires must already be true by the time this fires, in whatever order the application
-- posted the supporting rows (new batches, their SALE_RETURN movements)
CREATE FUNCTION trg_fn_sale_returns_completion_guard() RETURNS TRIGGER AS $$
DECLARE
    v_sale_status   VARCHAR(20);
    v_missing_batch INTEGER;
    v_over_returned INTEGER;
BEGIN
    IF NOT (NEW.status = 'completed' AND OLD.status = 'draft') THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM sale_return_items WHERE sale_return_id = NEW.id) THEN
        RAISE EXCEPTION 'sale_return % has no items to complete', NEW.id;
    END IF;

    -- the sale must STILL be completed — it may have been voided since this return was
    -- drafted, which is exactly the double-restore scenario this guard exists to prevent
    -- (see sales_guard_update's matching check on the other side of that same scenario)
    SELECT status INTO v_sale_status FROM sales WHERE id = NEW.sale_id;
    IF v_sale_status <> 'completed' THEN
        RAISE EXCEPTION 'sale % is % and sale_return % can no longer be completed against it',
            NEW.sale_id, v_sale_status, NEW.id;
    END IF;

    -- lock every original sale_item_batches allocation this return draws from, BEFORE
    -- computing how much of it has already been returned. Without this lock, two
    -- concurrent completions against the same original allocation could each read the
    -- same "already returned" total, each independently pass the ceiling check below,
    -- and together over-return it — a plain read-then-check-then-act race, invisible to
    -- any test that doesn't run two completions at once. Locking first forces the second
    -- transaction's completion to block here until the first commits (or rolls back), so
    -- its own check below is guaranteed to see the first return's now-committed total.
    -- Same idiom as check_tenant_has_active_owner's `FOR SHARE` lock on tenants — lock the
    -- shared resource before reading an aggregate over it. ORDER BY id gives every
    -- concurrent completion the same lock-acquisition order, so two returns naming the
    -- same batches in a different order can't deadlock against each other.
    PERFORM 1
      FROM sale_item_batches
     WHERE id IN (SELECT sale_item_batch_id FROM sale_return_items WHERE sale_return_id = NEW.id)
     ORDER BY id
       FOR UPDATE;

    -- no original batch allocation may end up over-returned once this return's own
    -- quantities are counted alongside every OTHER already-completed return's quantities
    -- against it. Draft returns (this one's siblings, not this one itself) are deliberately
    -- excluded — no reservation during draft, the same choice already made for sale_item_batches
    -- during a draft sale; a conflicting draft simply fails here, at ITS OWN completion, later.
    -- Safe to compute now: the lock above guarantees no concurrent completion can change
    -- these totals out from under this read.
    SELECT count(*) INTO v_over_returned
      FROM (
          SELECT sib.id, sib.quantity AS allowed, SUM(sri2.quantity) AS total_returned
            FROM sale_item_batches sib
            JOIN sale_return_items sri2 ON sri2.sale_item_batch_id = sib.id
            JOIN sale_returns sr2 ON sr2.id = sri2.sale_return_id
           WHERE sr2.status = 'completed' OR sr2.id = NEW.id
           GROUP BY sib.id, sib.quantity
      ) totals
     WHERE totals.total_returned > totals.allowed;

    IF v_over_returned > 0 THEN
        RAISE EXCEPTION 'sale_return % returns more than remains returnable for % batch allocation(s)',
            NEW.id, v_over_returned;
    END IF;

    -- every return line must have produced its own return-origin batch, of the matching
    -- quantity, with a matching SALE_RETURN movement — mirrors check_sale_item_batch_movements
    -- (see sales) one layer over, for the return side
    SELECT count(*) INTO v_missing_batch
      FROM sale_return_items sri
     WHERE sri.sale_return_id = NEW.id
       AND NOT EXISTS (
           SELECT 1 FROM inventory_batches ib
            WHERE ib.sale_return_item_id = sri.id
              AND ib.received_quantity = sri.quantity
              AND EXISTS (
                  SELECT 1 FROM stock_movements sm
                   WHERE sm.batch_id = ib.id
                     AND sm.movement_type = 'SALE_RETURN'
                     AND sm.reference_type = 'SALE_RETURN'
                     AND sm.reference_id = sri.id
                     AND sm.quantity = sri.quantity
              )
       );

    IF v_missing_batch > 0 THEN
        RAISE EXCEPTION 'sale_return % is missing % return batch/movement pair(s)', NEW.id, v_missing_batch;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_sale_returns_completion_guard
    AFTER UPDATE ON sale_returns
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_sale_returns_completion_guard();
```

### Notes

- **`draft` → `completed`, one edge, terminal — no `reversed` state.** Return reversal is explicitly out of Phase 1 scope (unlike `purchase_returns`, which has one): once a return completes, it stays completed. A mistaken return is a manual, out-of-band correction in Phase 1, not a schema-supported reversal.
- **No `customer_id` on this table, deliberately.** The customer relationship is `Customer → Sale → Sale Return`; `sales.customer_id` (nullable, for guest sales) remains the one authoritative source. A guest sale can still be returned the same way any other sale can — the return only ever needs `sale_id`, never the customer directly.
- **The eligibility check runs twice, not once, because `completed` isn't terminal for a sale the way `received` is for a purchase.** `trg_sale_returns_require_completed_sale` (immediate, at draft creation) mirrors `purchase_returns_require_received_purchase` exactly, but a sale can still be voided *after* a return is drafted against it — something that can't happen to a `received` purchase. `trg_fn_sale_returns_completion_guard` re-checks `sales.status = 'completed'` at commit of the return's own `draft → completed` transition, which is what actually prevents the double-restore scenario described on `sales`.
- **No reservation during draft, mirroring the sales design exactly.** A draft return doesn't touch `available_quantity`, doesn't stake a claim on a batch allocation, and isn't counted against other returns' over-return ceiling. Two drafts can be built against overlapping quantities from the same original batch allocation at once; whichever *completes* first "wins," and the second fails its own completion guard, with a clear error, rather than being blocked (or silently reserving stock) at draft time.
- **Two concurrent *completions* against the same original allocation are serialized by an explicit row lock, not just by the check above.** `trg_fn_sale_returns_completion_guard` takes `SELECT ... FOR UPDATE` on every `sale_item_batches` row this return draws from *before* computing how much of it has already been returned. Without that lock, two completions racing against the same allocation could each read the same "already returned" total, each independently pass the ceiling check, and together over-return it — the check alone, without a lock, only prevents over-return when completions happen one at a time. The lock is what makes the second completion's read see the first completion's already-committed total, rather than a stale snapshot from before it existed.
- **The over-return ceiling is per original `sale_item_batches` allocation, not per `sale_item`.** Your example — `Red Saree × 10` as `B001 → 6` / `B002 → 4`, returning 7 as `B001 → 4` / `B002 → 3` — is valid because each return line stays within its own batch allocation's remaining quantity (`4 ≤ 6`, `3 ≤ 4`), which is exactly what `trg_fn_sale_returns_completion_guard` checks. A sale-item-level ceiling (returned ≤ original `sale_items.quantity` − already returned) is not checked separately: it's implied by the per-batch checks, given the invariant `sales`' own completion guard already proved — that a completed sale's allocations sum to exactly its `sale_items.quantity` — so summing valid per-batch returns can never exceed it either.
- **Financial amount is derived, never duplicated.** `sale_return_items` carries no `unit_price`/`discount_amount`/`tax_amount`/`line_total` of its own; the refundable amount for a return line is `sale_items.unit_price` (etc.) for the line it points at, prorated by `sale_return_items.quantity`. This is safe specifically because `sale_items` freezes at sale completion — there's no risk of the source data changing under a return computed later. A future refund system (see "Future path") reads this the same way, rather than trusting a second, possibly stale, copy of the money.

Example queries:

```sql
-- everything a completed return did: which original lines/batches it drew from, the new
-- return batches it created, and the movements that posted them
SELECT sri.sale_item_id, sri.sale_item_batch_id, sri.quantity AS returned_quantity,
       ib.id AS return_batch_id, ib.barcode AS return_batch_barcode,
       sm.id AS movement_id
  FROM sale_return_items sri
  JOIN inventory_batches ib ON ib.sale_return_item_id = sri.id
  JOIN stock_movements sm ON sm.batch_id = ib.id AND sm.movement_type = 'SALE_RETURN'
 WHERE sri.tenant_id = $1 AND sri.sale_return_id = $2;

-- how much of a given original sale item has been returned so far (completed returns only)
SELECT si.id AS sale_item_id, si.quantity AS original_quantity,
       COALESCE(SUM(sri.quantity), 0) AS returned_quantity
  FROM sale_items si
  LEFT JOIN sale_return_items sri ON sri.sale_item_id = si.id
  LEFT JOIN sale_returns sr ON sr.id = sri.sale_return_id AND sr.status = 'completed'
 WHERE si.tenant_id = $1 AND si.sale_id = $2
 GROUP BY si.id, si.quantity;
```

---

## `sale_return_items`

One row per original batch allocation being returned from — the return-side mirror of `sale_item_batches` (**`sale_returns 1:N sale_return_items`**, **`sale_items 1:N sale_return_items`**, **`sale_item_batches 1:N sale_return_items`**). Mutable while its parent `sale_returns.status = 'draft'`, frozen from `completed` onward — same idiom every other draft-then-frozen line-item table in this schema already uses.

```sql
CREATE TABLE sale_return_items (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    variant_id          UUID NOT NULL,
    sale_return_id      UUID NOT NULL,
    sale_item_id        UUID NOT NULL,
    sale_item_batch_id  UUID NOT NULL,
    quantity            INTEGER NOT NULL
                            CONSTRAINT sale_return_items_quantity_check CHECK (quantity > 0),
    notes               VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- target for inventory_batches' return-origin FK (added there by ALTER TABLE, after
    -- this table — see that table's notes for why)
    CONSTRAINT sale_return_items_target_unique
        UNIQUE (tenant_id, store_id, id, variant_id),
    -- the return header this line belongs to: tenant AND store must agree
    CONSTRAINT sale_return_items_return_fk
        FOREIGN KEY (tenant_id, store_id, sale_return_id)
        REFERENCES sale_returns (tenant_id, store_id, id),
    -- the original commercial line being returned from: tenant, store AND variant must agree
    CONSTRAINT sale_return_items_sale_item_fk
        FOREIGN KEY (tenant_id, store_id, sale_item_id, variant_id)
        REFERENCES sale_items (tenant_id, store_id, id, variant_id),
    -- the original batch allocation being returned from: tenant, store, variant AND
    -- sale_item must all agree — this is what stops a return line from naming a batch
    -- allocation that actually belongs to a different sale item
    CONSTRAINT sale_return_items_batch_fk
        FOREIGN KEY (tenant_id, store_id, sale_item_batch_id, sale_item_id, variant_id)
        REFERENCES sale_item_batches (tenant_id, store_id, id, sale_item_id, variant_id)
);

CREATE INDEX idx_sale_return_items_return ON sale_return_items (sale_return_id);
CREATE INDEX idx_sale_return_items_sale_item ON sale_return_items (tenant_id, sale_item_id);
CREATE INDEX idx_sale_return_items_batch ON sale_return_items (tenant_id, store_id, sale_item_batch_id);

CREATE TRIGGER trg_sale_return_items_set_updated_at
    BEFORE UPDATE ON sale_return_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- lines are editable only while the parent return is draft — mirrors
-- sale_items_require_draft_sale exactly, one table over
CREATE FUNCTION sale_return_items_require_draft_return() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM sale_returns
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_return_id ELSE NEW.sale_return_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'sale_return_items cannot be changed once the return is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_return_items_require_draft_return
    BEFORE INSERT OR UPDATE OR DELETE ON sale_return_items
    FOR EACH ROW
    EXECUTE FUNCTION sale_return_items_require_draft_return();

-- identity columns are immutable; only quantity and notes may change (and only while draft,
-- per the trigger above)
CREATE FUNCTION sale_return_items_prevent_identity_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id
       OR NEW.variant_id <> OLD.variant_id OR NEW.sale_return_id <> OLD.sale_return_id
       OR NEW.sale_item_id <> OLD.sale_item_id OR NEW.sale_item_batch_id <> OLD.sale_item_batch_id THEN
        RAISE EXCEPTION 'sale_return_items identity columns are immutable (return item %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_return_items_prevent_identity_change
    BEFORE UPDATE ON sale_return_items
    FOR EACH ROW
    EXECUTE FUNCTION sale_return_items_prevent_identity_change();
```

### Notes

- **No continuous per-row ceiling check here, unlike `sale_item_batches`' allocation guard.** `sale_item_batches` checks its ceiling continuously because it's a single-sale-scoped question (allocations for one sale item, within one sale, can't exceed that item's quantity). A return line's ceiling is inherently cross-document — how much of *this original batch allocation* has been returned across *every* return anyone has completed against it — so it's checked once, authoritatively, in `sale_returns`' own completion guard, consistent with "no reservation during draft."
- **`variant_id` is carried here** even though it wasn't in the original suggested field list, for the same reason every other allocation-layer table in this schema carries it: it's what lets the composite FKs above (and `inventory_batches`' return-origin FK, next table) enforce tenant/store/variant consistency directly, without relying on a longer join chain to catch a mismatch.
- **A return line names both `sale_item_id` and `sale_item_batch_id`, not just the batch allocation.** `sale_return_items_batch_fk` ties the two together (the named batch allocation must actually belong to the named sale item), which is what makes a return line's origin unambiguous even before joining anywhere else.

Now that `sale_return_items` exists, `inventory_batches`' return-origin FK (declared as a bare column earlier, to avoid a circular forward reference — see that table's notes) can finally be added:

```sql
ALTER TABLE inventory_batches
    ADD CONSTRAINT inventory_batches_sale_return_item_fk
    FOREIGN KEY (tenant_id, store_id, sale_return_item_id, variant_id)
    REFERENCES sale_return_items (tenant_id, store_id, id, variant_id);
```

---

## `sale_payments`

The actual money received against a sale — **one sale can have several payments**, potentially different methods and accounts each. **Mutable while its parent `sales.status = 'draft'`, frozen from `completed` onward** — this table's own lifecycle changed from the first draft of this phase; see the summary after this edit for why.

```sql
CREATE TABLE sale_payments (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    store_id            UUID NOT NULL,
    sale_id             UUID NOT NULL,
    payment_method_id   UUID NOT NULL,
    -- nullable: a customer-credit payment has no real receiving account — see notes
    payment_account_id  UUID,
    amount              NUMERIC(12,2) NOT NULL
                            CONSTRAINT sale_payments_amount_check CHECK (amount > 0),
    -- when the money actually arrived (business time) — may be backdated, same idiom as
    -- stock_movements.occurred_at
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference           VARCHAR(100),
    notes               TEXT,
    -- every financial ledger entry in this schema is attributable — same reasoning as
    -- stock_movements.created_by; not in the suggested field list, added for that reason
    created_by          UUID NOT NULL REFERENCES users (id),
    -- when the row was recorded (system time) — never backdated
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sale_payments_sale_fk
        FOREIGN KEY (tenant_id, store_id, sale_id) REFERENCES sales (tenant_id, store_id, id),
    CONSTRAINT sale_payments_payment_method_fk
        FOREIGN KEY (tenant_id, payment_method_id) REFERENCES payment_methods (tenant_id, id),
    -- MATCH SIMPLE: a NULL payment_account_id skips this check, which is exactly what a
    -- customer-credit payment needs
    CONSTRAINT sale_payments_payment_account_fk
        FOREIGN KEY (tenant_id, store_id, payment_account_id)
        REFERENCES payment_accounts (tenant_id, store_id, id),

    -- target for customer_credit_ledger.sale_payment_id
    CONSTRAINT sale_payments_tenant_id_id_unique UNIQUE (tenant_id, id)
);

CREATE INDEX idx_sale_payments_sale ON sale_payments (sale_id);
CREATE INDEX idx_sale_payments_method ON sale_payments (tenant_id, payment_method_id);
CREATE INDEX idx_sale_payments_account
    ON sale_payments (tenant_id, payment_account_id) WHERE payment_account_id IS NOT NULL;
CREATE INDEX idx_sale_payments_received_at ON sale_payments (tenant_id, store_id, received_at);

CREATE TRIGGER trg_sale_payments_set_updated_at
    BEFORE UPDATE ON sale_payments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- a payment's account requirement must match its method's is_customer_credit flag —
-- checked immediately (no sibling rows needed, just a lookup on payment_methods),
-- on every insert or edit, since amount/method/account can all change while draft
CREATE FUNCTION sale_payments_validate() RETURNS TRIGGER AS $$
DECLARE
    v_is_credit BOOLEAN;
BEGIN
    SELECT is_customer_credit INTO v_is_credit
      FROM payment_methods
     WHERE id = NEW.payment_method_id AND tenant_id = NEW.tenant_id;

    IF v_is_credit AND NEW.payment_account_id IS NOT NULL THEN
        RAISE EXCEPTION 'sale_payment % uses a customer-credit method and must not name a payment_account', NEW.id;
    ELSIF NOT v_is_credit AND NEW.payment_account_id IS NULL THEN
        RAISE EXCEPTION 'sale_payment % must name a payment_account unless its method is customer credit', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_payments_validate
    BEFORE INSERT OR UPDATE ON sale_payments
    FOR EACH ROW
    EXECUTE FUNCTION sale_payments_validate();

-- editable only while the parent sale is draft; once completed or voided, a payment
-- record is history — mirrors sale_items_require_draft_sale exactly
CREATE FUNCTION sale_payments_require_draft_sale() RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
      FROM sales
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'sale_payments cannot be changed once the sale is %', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_payments_require_draft_sale
    BEFORE INSERT OR UPDATE OR DELETE ON sale_payments
    FOR EACH ROW
    EXECUTE FUNCTION sale_payments_require_draft_sale();

CREATE FUNCTION sale_payments_prevent_identity_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id
       OR NEW.sale_id <> OLD.sale_id THEN
        RAISE EXCEPTION 'sale_payments tenant_id, store_id and sale_id are immutable (payment %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_payments_prevent_identity_change
    BEFORE UPDATE ON sale_payments
    FOR EACH ROW
    EXECUTE FUNCTION sale_payments_prevent_identity_change();
```

### Notes

- **"Payments must sum exactly to the sale total" is enforced at completion, not continuously during draft** — see `sales`' completion guard (`trg_sales_completion_guard`), which checks `SUM(sale_payments.amount) = sales.total_amount` at the `draft → completed` transition. Customer credit needs no separate handling in that sum: it's already a `sale_payments` row like any other, so "actual payments + customer credit = total" (the requirement) and "payments sum to total" are the same check. A draft sale can carry zero, partial, or over-allocated payments while still being built; only completion demands the exact reconciliation, and an unexplained underpayment simply can't complete.
- **`payment_account_id` is nullable for exactly one reason: customer credit.** `trg_sale_payments_validate` enforces the pairing precisely — every non-credit method needs a real account, every credit method must not name one — so "customer credit isn't cash received into a bank/cash account" is a hard constraint, not a convention. A `CUSTOMER_CREDIT` payment is a receivable, not a receipt.
- **Every customer-credit payment is guaranteed, at the sale's completion, to have produced a `customer_credit_ledger` entry** — enforced by `sales`' completion guard, not by a trigger on this table (see the next note for why that moved). The application flow is: while `draft`, insert/edit `sale_payments` rows freely; to complete, insert the matching `customer_credit_ledger` row (`entry_type='CREDIT_SALE'`, `sale_payment_id`=that row's id, same `amount`) for every customer-credit payment, then flip `sales.status` to `completed` — all in one transaction, in any order, verified together at commit.
- **Historical traceability survives a disabled method/account**, because the FK only requires the referenced row to *exist*, not to be `active` — disabling never breaks a historical `sale_payments` row's ability to be joined back to what method/account it used.
- **`received_at` (business time) vs. `created_at` (record time)** is the exact same split `stock_movements` already established, for the same reason: a payment might be recorded slightly after it was actually received (e.g. an end-of-day reconciliation entering a cash count), and the two timestamps shouldn't be conflated.
- **No refund/reversal mechanism is built here.** The requirement is explicit that this isn't Phase 1 scope; what *is* built is the frozen-after-completion guarantee (so a wrong payment can't silently become a different amount once the sale is done) and a schema shape that doesn't block adding a `sale_payment_reversals`-style table later, the same way `purchase_returns` was added without touching `purchases`. Voiding a sale reverses inventory and customer credit (see `sales`' void behaviour) but explicitly does **not** reverse actual cash/UPI/card money already received — that remains this same documented gap, now more consequential since voiding is a real Phase 1 feature.

Example queries:

```sql
-- how was this sale paid?
SELECT pm.name AS method, pa.name AS account, sp.amount, sp.received_at
  FROM sale_payments sp
  JOIN payment_methods pm ON pm.id = sp.payment_method_id AND pm.tenant_id = sp.tenant_id
  LEFT JOIN payment_accounts pa ON pa.id = sp.payment_account_id AND pa.tenant_id = sp.tenant_id
 WHERE sp.tenant_id = $1 AND sp.sale_id = $2
 ORDER BY sp.created_at;

-- daily cash-drawer reconciliation for a store (completed sales only — a draft's
-- payments aren't real money received yet, they're still being assembled)
SELECT pa.name AS account, SUM(sp.amount) AS total_received
  FROM sale_payments sp
  JOIN payment_accounts pa ON pa.id = sp.payment_account_id AND pa.tenant_id = sp.tenant_id
  JOIN sales s ON s.id = sp.sale_id AND s.tenant_id = sp.tenant_id
 WHERE sp.tenant_id = $1 AND sp.store_id = $2 AND s.status = 'completed'
   AND sp.received_at >= $3 AND sp.received_at < $4
 GROUP BY pa.name;
```

---

## `customer_credit_ledger`

The append-only receivables ledger — how much a customer owes the business, derived the same way `stock_movements` derives on-hand: a `SUM()`, never a stored balance.

```sql
CREATE TABLE customer_credit_ledger (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    -- credit always ties to a known customer — unlike sales.customer_id, never NULL
    customer_id         UUID NOT NULL,
    store_id            UUID NOT NULL,
    -- populated for CREDIT_SALE only — see the pair-check below
    sale_id             UUID,
    sale_payment_id     UUID,
    entry_type          VARCHAR(30) NOT NULL
                            CONSTRAINT customer_credit_ledger_entry_type_check
                            CHECK (entry_type IN (
                                'CREDIT_SALE', 'CREDIT_PAYMENT', 'CREDIT_ADJUSTMENT', 'CREDIT_REVERSAL')),
    -- SIGNED, unlike stock_movements.quantity — see notes for why this table uses the
    -- opposite convention deliberately
    amount              NUMERIC(12,2) NOT NULL
                            CONSTRAINT customer_credit_ledger_amount_nonzero_check CHECK (amount <> 0),
    created_by          UUID NOT NULL REFERENCES users (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference           VARCHAR(100),
    notes               TEXT,
    -- populated for CREDIT_REVERSAL only: the entry this one reverses. A real FK, not
    -- just free text — closing a gap flagged when this table was first designed
    reverses_entry_id   UUID,

    -- CREDIT_SALE always increases the receivable and always traces to the exact payment
    -- that created it; CREDIT_PAYMENT always decreases it. CREDIT_ADJUSTMENT/CREDIT_REVERSAL
    -- are the only entry types allowed to go either direction, because a correction has to
    -- be able to undo a mistake in either direction
    CONSTRAINT customer_credit_ledger_sign_check CHECK (
        (entry_type = 'CREDIT_SALE' AND amount > 0)
        OR (entry_type = 'CREDIT_PAYMENT' AND amount < 0)
        OR entry_type IN ('CREDIT_ADJUSTMENT', 'CREDIT_REVERSAL')
    ),
    -- a CREDIT_SALE always has the sale_payment_id that created it; nothing else does
    CONSTRAINT customer_credit_ledger_sale_payment_pair_check
        CHECK ((entry_type = 'CREDIT_SALE') = (sale_payment_id IS NOT NULL)),
    -- a CREDIT_REVERSAL always names what it reverses; nothing else does
    CONSTRAINT customer_credit_ledger_reverses_pair_check
        CHECK ((entry_type = 'CREDIT_REVERSAL') = (reverses_entry_id IS NOT NULL)),

    -- target for reverses_entry_id's self-reference
    CONSTRAINT customer_credit_ledger_tenant_id_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT customer_credit_ledger_customer_fk
        FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id),
    CONSTRAINT customer_credit_ledger_store_fk
        FOREIGN KEY (tenant_id, store_id) REFERENCES stores (tenant_id, id),
    -- MATCH SIMPLE: NULL sale_id skips this check (CREDIT_PAYMENT/ADJUSTMENT/REVERSAL
    -- are typically not tied to any one sale)
    CONSTRAINT customer_credit_ledger_sale_fk
        FOREIGN KEY (tenant_id, store_id, sale_id) REFERENCES sales (tenant_id, store_id, id),
    CONSTRAINT customer_credit_ledger_sale_payment_fk
        FOREIGN KEY (tenant_id, sale_payment_id) REFERENCES sale_payments (tenant_id, id),
    -- MATCH SIMPLE: NULL reverses_entry_id skips this check, i.e. every non-reversal row
    CONSTRAINT customer_credit_ledger_reverses_entry_fk
        FOREIGN KEY (tenant_id, reverses_entry_id) REFERENCES customer_credit_ledger (tenant_id, id)
);

-- at most one CREDIT_SALE ledger entry per sale_payment — a 1:1 relationship, not 1:N
CREATE UNIQUE INDEX idx_customer_credit_ledger_sale_payment_unique
    ON customer_credit_ledger (sale_payment_id)
    WHERE sale_payment_id IS NOT NULL;

-- at most one reversal per entry — an entry can't be reversed twice
CREATE UNIQUE INDEX idx_customer_credit_ledger_reverses_entry_unique
    ON customer_credit_ledger (reverses_entry_id)
    WHERE reverses_entry_id IS NOT NULL;

CREATE INDEX idx_customer_credit_ledger_customer
    ON customer_credit_ledger (tenant_id, customer_id, created_at);
CREATE INDEX idx_customer_credit_ledger_sale
    ON customer_credit_ledger (sale_id) WHERE sale_id IS NOT NULL;

-- cross-row checks a plain FK/CHECK can't express: a ledger entry naming a sale must
-- belong to that sale's actual customer, and a reversal must exactly negate — same
-- amount, opposite sign, same customer — the entry it names
CREATE FUNCTION customer_credit_ledger_validate() RETURNS TRIGGER AS $$
DECLARE
    v_sale_customer_id  UUID;
    v_original_amount   NUMERIC(12,2);
    v_original_customer UUID;
BEGIN
    IF NEW.sale_id IS NOT NULL THEN
        SELECT customer_id INTO v_sale_customer_id
          FROM sales
         WHERE id = NEW.sale_id AND tenant_id = NEW.tenant_id AND store_id = NEW.store_id;

        IF v_sale_customer_id IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION 'customer_credit_ledger % customer does not match sale % customer',
                NEW.id, NEW.sale_id;
        END IF;
    END IF;

    IF NEW.reverses_entry_id IS NOT NULL THEN
        SELECT amount, customer_id INTO v_original_amount, v_original_customer
          FROM customer_credit_ledger
         WHERE id = NEW.reverses_entry_id AND tenant_id = NEW.tenant_id;

        IF NEW.amount <> -1 * v_original_amount THEN
            RAISE EXCEPTION 'CREDIT_REVERSAL % must exactly negate entry % (expected %, got %)',
                NEW.id, NEW.reverses_entry_id, -1 * v_original_amount, NEW.amount;
        END IF;
        IF NEW.customer_id <> v_original_customer THEN
            RAISE EXCEPTION 'CREDIT_REVERSAL % customer must match the entry it reverses (%)',
                NEW.id, NEW.reverses_entry_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_credit_ledger_validate
    BEFORE INSERT ON customer_credit_ledger
    FOR EACH ROW
    EXECUTE FUNCTION customer_credit_ledger_validate();

-- append-only: no updates, no deletes, ever — a correction is a new CREDIT_ADJUSTMENT
-- or CREDIT_REVERSAL row, never an edit
CREATE FUNCTION customer_credit_ledger_reject_change() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'customer_credit_ledger is append-only; record a correcting entry instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_credit_ledger_append_only
    BEFORE UPDATE OR DELETE ON customer_credit_ledger
    FOR EACH ROW
    EXECUTE FUNCTION customer_credit_ledger_reject_change();

-- the balance is always a query, never a stored fact — same idiom as batch_stock_on_hand.
-- positive = the customer owes the business (a receivable); the sign convention above is
-- what makes a plain SUM() the right answer with no CASE/sign function needed
CREATE VIEW customer_credit_balance WITH (security_invoker = true) AS
SELECT tenant_id, customer_id, SUM(amount) AS balance
  FROM customer_credit_ledger
 GROUP BY tenant_id, customer_id;
```

### Notes

- **Signed `amount`, not unsigned-plus-a-sign-function like `stock_movements.quantity`.** This is a deliberate departure from that convention, not an inconsistency: the requirement here specified the sign convention directly, with worked examples (`CREDIT_SALE → +₹2,000`, `CREDIT_PAYMENT → -₹1,000`), which is a genuinely different shape of requirement than `stock_movements` had (direction implied by type, not given as a literal signed number in the spec). `customer_credit_ledger_sign_check` still hard-enforces that `CREDIT_SALE` and `CREDIT_PAYMENT` can only carry the sign the business meaning demands — the *value* is signed, but which sign is still constrained, not a free-for-all.
- **`CREDIT_ADJUSTMENT` and `CREDIT_REVERSAL` are the only entry types allowed either sign, on purpose.** A correction has to be able to move the balance in whichever direction actually fixes the mistake — reversing a wrongly-posted `CREDIT_SALE` needs a negative entry, reversing a wrongly-posted `CREDIT_PAYMENT` needs a positive one. Locking their sign the way `CREDIT_SALE`/`CREDIT_PAYMENT` are locked would make some corrections impossible to represent.
- **A `CREDIT_PAYMENT` (paying down an existing balance) is *not* a `sale_payments` row.** `sale_payments.sale_id` is `NOT NULL` — every row there is a payment *against a sale*. Paying down an old balance isn't a new sale; it's a standalone `customer_credit_ledger` entry with `sale_id`/`sale_payment_id` both `NULL`. Only the credit-creation direction (`CREDIT_SALE`, born from a `CUSTOMER_CREDIT` `sale_payments` row) is tied to a sale at all.
- **`customer_id` is `NOT NULL` here, unlike `sales.customer_id`.** Credit is inherently a relationship with a known person — there is no such thing as anonymous credit — so this table has no guest-equivalent path, by construction.
- **Reversal linkage now has a real FK, closing a gap flagged when this table was first designed.** `reverses_entry_id` is a self-reference, tenant-scoped and validated on insert: `customer_credit_ledger_validate` requires a `CREDIT_REVERSAL`'s `amount` to exactly negate the entry it names and its `customer_id` to match — not just "linked clearly enough," but arithmetically verified. `idx_customer_credit_ledger_reverses_entry_unique` additionally guarantees an entry can be reversed at most once.
- **Append-only is enforced at the privilege level too, not just by the row-level reject trigger above.** `app_role` has `UPDATE, DELETE, TRUNCATE` revoked on this table ("The application-role privilege model," under "Row-level security") — the same two-layer defence `stock_movements` has, for the same reason: a trigger alone can't stop a role with the raw privilege from disabling or working around it, so the grant itself is narrowed too.

---

## Payment method vs. payment account

The distinction this whole phase depends on, stated once, plainly:

| | Payment method | Payment account |
|---|---|---|
| **Answers** | *How* did the customer pay? | *Where* did that money land? |
| **Table** | `payment_methods` | `payment_accounts` |
| **Scope** | Tenant-level | Store-level |
| **Examples** | `CASH`, `UPI`, `CARD`, `BANK_TRANSFER`, `CUSTOMER_CREDIT` | "Main Store Cash Drawer", "HDFC Current Account", "HDFC Card Settlement Account" |
| **Cardinality** | One method can land in several different accounts (UPI payments might go to more than one bank account) | One account can receive several different methods in principle (though Phase 1's examples pair them 1:1) |
| **Holds credentials?** | No | No — never; see that table's notes |

`sale_payments` is where the two meet: every row names **one method and (usually) one account** — `UPI` paid into `HDFC Current Account` is two separate facts on one row, not one combined field. The one exception is `CUSTOMER_CREDIT`, which names a method but deliberately no account, because nothing was actually received anywhere (see `sale_payments`' notes) — that asymmetry is exactly why these stayed two tables instead of one.

---

## Customer purchase history

**Not duplicated onto `customers`.** The authoritative path is:

```text
customers → sales → sale_items → variants
```

Everything a "customer profile" screen would want — products purchased, dates, quantities, prices paid, discounts, tax, total spend — is a query over `sales`/`sale_items`, never a column copied onto `customers`. This is the same principle `inventory_batches.available_quantity` had to earn an exception to and `customers` doesn't: there is no cached "lifetime spend" column here to keep in sync, drift, or reconcile.

```sql
-- a customer's purchase history: what, when, how much (completed sales only — a draft
-- isn't a real transaction yet, and a voided one was undone)
SELECT s.sold_at, si.variant_id, si.quantity, si.unit_price,
       si.discount_amount, si.tax_amount, si.line_total
  FROM sales s
  JOIN sale_items si ON si.sale_id = s.id
 WHERE s.tenant_id = $1 AND s.customer_id = $2 AND s.status = 'completed'
 ORDER BY s.sold_at DESC;

-- lifetime spend, computed on demand — never stored
SELECT COALESCE(SUM(total_amount), 0) AS lifetime_spend
  FROM sales
 WHERE tenant_id = $1 AND customer_id = $2 AND status = 'completed';
```

---

## Selling price, purchase cost, quantity and barcode

These four are easy to blur and must stay separate.

| Concept | Where it lives | Meaning | Mutable? |
|---|---|---|---|
| **Selling price** | `variants.base_price` | What a customer pays for this variant | Yes (price changes; history table later) |
| **Purchase cost** | `purchase_items.unit_cost` (the deal) and `inventory_batches.unit_cost` (cost basis of the stock) | What we paid the supplier | Line: only while the purchase is open. Batch: never |
| **Inventory quantity** | `inventory_batches.received_quantity` (how many arrived) and `inventory_batches.available_quantity` (how many are here now — the fast, trigger-maintained path); `SUM(stock_movements.quantity * stock_movement_sign(movement_type))` via `batch_stock_on_hand` is the same number, derived, kept for reconciliation | Units received vs units currently available | `received_quantity`: never. `available_quantity`: only via a `stock_movements` insert, never by a direct `UPDATE` |
| **Barcode** | `inventory_batches.barcode` | Identifies one batch of physical stock, and through it (via stored `variant_id`/`id` columns, not by parsing the string) the variant and its cost basis | Never |

Because price sits on the variant and cost sits on the purchase line and batch, two batches of the same variant can have different costs while every customer still sees one selling price.

---

## Relationship rationale

| Relationship | Why it exists |
|---|---|
| `stores 1:N sellables` | A sellable is created within a store. This gives every catalogue row a home now, without any sharing model. |
| `sellables 1:N variants` | The sellable is the idea ("Silk Saree"); the variant is the thing you can stock, price and sell (Red/6m). Splitting them lets one idea have many prices and stock levels. `variants.store_id` is denormalised from the sellable (and FK-tied to it), so a variant's store is directly, not just transitively, enforceable further down the chain. |
| `stores 1:N purchases` | Purchasing is an operational event at a store, and the store is where stock arrives. |
| `suppliers 1:N purchases` | One supplier serves many purchases, and reports like "spend by supplier" need the link. Suppliers are tenant-level. |
| `purchases 1:N purchase_items` | A purchase is a header plus lines. |
| `variants 1:N purchase_items` | The variant is the unit of purchasing, so cost history hangs off the variant. |
| `purchase_items 1:N inventory_batches` | Stock traces back to what was bought, and one line can arrive as several batches. |
| `variants 1:N inventory_batches` | Batches are the physical stock of a variant, with as many cost tiers as it has batches. |
| `inventory_batches 1:N stock_movements` | Everything that happens to a batch after receipt is a row in its ledger. |
| `purchases 1:N purchase_returns` | A return is a separate transaction against an already-received purchase, never an edit to it. |
| `purchase_items 1:N purchase_return_items` | A return line traces back to the original purchase line it's crediting. |
| `inventory_batches 1:N purchase_return_items` | A return always targets one specific batch — the physical stock actually being sent back. |
| `stores 1:N sales` | A sale is an operational event at a store, same reasoning as `purchases`. |
| `customers 1:N sales` (nullable) | A customer *may* be attributed to a sale; a guest sale has no row on either side of this relationship at all, rather than a placeholder customer. |
| `sales 1:N sale_items` | A sale is a header plus lines, same shape as `purchases`/`purchase_items`. |
| `variants 1:N sale_items` | The variant is the unit of sale, mirroring `variants 1:N purchase_items` on the buy side. |
| `sale_items 1:N sale_item_batches` | A commercial line can be fulfilled from more than one physical batch — the allocation layer, mirroring `purchase_items 1:N inventory_batches` in reverse. |
| `inventory_batches 1:N sale_item_batches` | A batch can contribute to many sale items over time, as long as stock remains — mirroring `inventory_batches 1:N purchase_return_items`. |
| `sales 1:N sale_returns` | A return is a separate transaction against an already-completed sale, never an edit to it — mirroring `purchases 1:N purchase_returns`. |
| `sale_returns 1:N sale_return_items` | A return is a header plus lines, same shape as every other header/line pair in this schema. |
| `sale_items 1:N sale_return_items` | A return line always traces back to the original commercial line it's crediting — mirroring `purchase_items 1:N purchase_return_items`. |
| `sale_item_batches 1:N sale_return_items` | A return line always targets one specific original batch allocation — the physical stock actually coming back — mirroring `inventory_batches 1:N purchase_return_items`. |
| `sale_return_items 1:N inventory_batches` (0 or 1, after completion) | A completed return line creates exactly one new return-origin batch (`sale_return_item_id`); a draft line has none yet. The reverse of every other FK in this table: here the return line is the *parent*, since the batch is what completion *creates*, not something the line points at beforehand. |
| `sales 1:N sale_payments` | One sale can be paid across several payments — different methods, different accounts, or both. |
| `payment_methods 1:N sale_payments` | Tenant-level: the same method (e.g. `UPI`) is reused across every sale that used it. |
| `payment_accounts 1:N sale_payments` (nullable) | Store-level: every non-credit payment names the account it landed in; a `CUSTOMER_CREDIT` payment names none. |
| `customers 1:N customer_credit_ledger` | Every receivable entry ties to the customer who owes (or paid down) it — never nullable, unlike `sales.customer_id`. |
| `sale_payments 1:N customer_credit_ledger` (0 or 1) | A `CUSTOMER_CREDIT` payment produces exactly one `CREDIT_SALE` ledger entry; every other payment produces none. |
| `customer_credit_ledger 1:N customer_credit_ledger` (0 or 1, self) | A `CREDIT_REVERSAL` names the exact entry it undoes via `reverses_entry_id`; an entry can be reversed at most once. |

### How the main flows map

| Flow | Rows written |
|---|---|
| Create a product | 1 `sellables` (no price) + ≥1 `variants` (each with its own `base_price`, SKU and name) |
| Archive / reactivate a product | `UPDATE sellables SET status='archived'`(or back to `'active'`) — no cascade to its variants, no stock effect, nothing else written |
| Deactivate / reactivate a variant | `UPDATE variants SET status='deactivated'` (or back to `'active'`) — no stock effect, `inventory_batches` completely untouched, nothing else written |
| Record a purchase | 1 `purchases` + N `purchase_items` (header totals recomputed in the same transaction) |
| Receive stock | Mark the purchase `received`; per batch, 1 `inventory_batches` (`available_quantity` starts at 0) + 1 `PURCHASED` `stock_movements` row (`reference_type='PURCHASE_ITEM'`), whose trigger brings `available_quantity` up to `received_quantity` — all in one transaction |
| Same variant bought at a new cost | A new purchase line and a new batch with its own barcode. Nothing existing changes |
| Draft a purchase return | 1 `purchase_returns` (header, `status='draft'`) + 1 `purchase_return_items` row per batch to return from. No stock effect yet — freely editable while draft |
| Complete a purchase return | Per item, 1 `PURCHASE_RETURN` `stock_movements` row (`reference_type='PURCHASE_RETURN'`, `reference_id`=that item's id), whose trigger decrements each batch's `available_quantity`; then `UPDATE purchase_returns SET status='completed'` — all in one transaction, verified at commit by the completion guard |
| Reverse a completed purchase return | Per item, 1 `PURCHASE_RETURN_REVERSAL` `stock_movements` row (same `reference_type='PURCHASE_RETURN'`/`reference_id` as the original item), whose trigger re-increments each batch's `available_quantity`; then `UPDATE purchase_returns SET status='reversed'` — same atomic pattern as completion. The original `purchase_returns`/`purchase_return_items` rows are untouched |
| Correct a miscount, damage or loss | 1 `DAMAGED` / `LOST` / `INTERNAL_USE` `stock_movements` row, optionally against a `STOCK_ADJUSTMENT` reference |
| Add a customer | 1 `customers` row. Not required before a sale — see the next row |
| Build a sale (either mode) | 1 `sales` (header, `status='draft'`) + 1 `sale_items` row per variant + 1+ `sale_item_batches` row per item — barcode-first writes the scanned batch directly; variant-first has the application run FIFO across eligible batches. Each `sale_items` insert is rejected if its variant or the variant's sellable isn't `active` (see "Product/variant lifecycle and the barcode model"). No stock effect, no ledger effect, freely editable |
| Take payment on a draft sale | 1+ `sale_payments` rows (cash/UPI/card/credit, any combination) — still no stock or ledger effect; only checked for completeness at the next step |
| Complete a sale | Per `sale_item_batches` row, 1 `SOLD` `stock_movements` row (`reference_type='SALE_ITEM'`, `reference_id`=the sale item's id), whose trigger decrements each batch's `available_quantity`; per customer-credit payment, 1 `customer_credit_ledger` row (`entry_type='CREDIT_SALE'`); then `UPDATE sales SET status='completed'` — all in one transaction, verified at commit that allocations are complete, movements exist, payments sum to the total, and credit entries exist |
| Void a completed sale | Per `sale_item_batches` row, 1 `SOLD_REVERSAL` `stock_movements` row restoring what was sold; per `CREDIT_SALE` entry, 1 `CREDIT_REVERSAL` row (`reverses_entry_id`=the original); then `UPDATE sales SET status='voided', void_reason='...'` (reason optional, free text) — same atomic, verified-at-commit pattern. Actual cash/card money already received is **not** reversed here — see "Future path". Blocked entirely if the sale has any `completed` `sale_returns` row against it (see `sales`' guard) |
| Draft a sale return | 1 `sale_returns` (header, `status='draft'`, against a `completed` sale) + 1 `sale_return_items` row per original batch allocation being returned from. No stock effect yet — freely editable while draft |
| Complete a sale return | Per return item: 1 new return-origin `inventory_batches` row (own barcode, `available_quantity` starts at 0, `unit_cost` copied from the original batch) + 1 `SALE_RETURN` `stock_movements` row against it (`reference_type='SALE_RETURN'`, `reference_id`=that return item's id), whose trigger brings the new batch's `available_quantity` up to the returned quantity; then `UPDATE sale_returns SET status='completed'` — all in one transaction, verified at commit that the sale is still completed, no allocation is over-returned, and every return line has its batch/movement pair |
| Customer pays down their balance | 1 `customer_credit_ledger` row (`entry_type='CREDIT_PAYMENT'`, negative `amount`, `sale_id`/`sale_payment_id` both `NULL`) — no `sale_payments` row, because this isn't a payment against any sale |
| Correct a credit-ledger mistake | 1 `customer_credit_ledger` row (`entry_type='CREDIT_ADJUSTMENT'` or `'CREDIT_REVERSAL'`, signed either direction as needed) |

### Future path (not Phase 1)

- **Multi-store sharing:** `sellables.store_id` becomes `source_store_id`, plus a `store_sellables` link, `store_variants` for store-level price overrides, and the store checks in the variant guard and in `variants`/`inventory_batches`' composite FKs are relaxed.
- **Store-specific price overrides and price history:** see "Future pricing compatibility" (under "Product/variant lifecycle and the barcode model") for why neither needs `variants.base_price` to change shape — a future `store_variants`-style override table (folded into multi-store sharing above) and an append-only `variant_price_history` table (who changed a price, when, without touching `variants`) both sit alongside it.
- **Transfers:** paired `stock_movements` rows between stores, with new movement types.
- **Batch splitting:** an existing batch's `available_quantity` divided into several new whole-number batches that preserve `variant_id` and `purchase_item_id`; needs a `parent_batch_id`-style lineage column and one or two new `stock_movements` types, not a redesign of `inventory_batches`.
- **Serial-number tracking:** a `stock_units` table beneath batches, without changing batches.
- **Facets and F&B:** optional child tables keyed on sellables and variants (Stocked, Weighed, Made, Configured, Routed, Timed). `kind` stays a coarse discriminator.
- **Deactivated/archived-stock workflows:** clearance, offers, manual adjustment, transfer, disposal and "special resale" for stock sitting under a deactivated variant or archived sellable are all explicitly out of Phase 1 (see "Product/variant lifecycle and the barcode model") — the stock is fully queryable and untouched today, just not sellable through the normal flow; none of these need a schema change to become reachable, only new application workflows (and, eventually, the same `condition`/`disposition` column already anticipated for returned-origin batches).
- **Also pending:** supplier payables, a `partially_received` purchase status (add to the `CHECK` when needed), and manufacturer barcodes in `variant_barcodes`.
- **Sale return reversal:** unlike `purchase_returns`, `sale_returns` has no `reversed` state in Phase 1 — a mistaken return is corrected manually, out-of-band, not through a schema-supported reversal. If this becomes a real need, it's the same additive shape `purchase_returns` already proved (a third status value plus a compensating movement type), not a redesign of `sale_returns`.
- **Refund / payment reversal mechanism (the biggest remaining financial gap):** neither voiding a sale nor completing a `sale_return` touches actual cash/UPI/card money already received — voiding reverses inventory (`SOLD_REVERSAL`) and customer credit (`CREDIT_REVERSAL`) only, and a completed return records the returned goods and restores inventory (via a new batch) only. `sale_return_items` deliberately carries no money columns of its own so a future refund system can compute the refundable amount straight from the (frozen) original `sale_items` row it points at — see that table's notes. A `sale_payment_reversals`-style table (mirroring how `purchase_returns` was added without touching `purchases`) is the next dependent piece, named rather than invented here.
- **Returned-batch classification:** a returned-origin `inventory_batches` row is not assumed equivalent to newly purchased stock — it may need inspection before resale, or routing into a clearance/offer flow. Phase 1 gives it no `status`/`condition` column of its own (see `inventory_batches`' "No `status` column" note), the same deliberate gap that note already anticipates for purchase-origin batches; a future `condition`/`disposition` column would apply uniformly to either origin, not just returns.
- **FEFO allocation:** `sale_item_batches` was deliberately designed so the allocation *strategy* lives in application/service-layer code, not the schema — switching variant-first selling from FIFO to FEFO (once expiry-enabled inventory exists) needs an `expires_at`-style column on `inventory_batches` and a service-layer change, not a `sale_item_batches` schema change.
- **Expiry tracking, serial-number tracking, multi-store transfers, store-to-store stock sharing, batch splitting** — all still exactly as deferred as before this phase; none of them were touched by the sales design.
- **Shared, multi-store payment accounts** — today every store gets its own `payment_accounts` row even for what is conceptually one bank account, the same single-store simplification the rest of Phase 1 already accepts.

---

## Decisions log

- **Soft delete via a terminal `status` value, no `deleted_at`, everywhere.** `tenants.archived`, `users.deactivated`, `stores.archived`, `tenant_memberships.removed` all follow the same pattern: deletion is a status transition, not a row removal. Retention/compliance handling (§13 N-09/N-10) is a query-time concern (`WHERE status != '...'`), not a physical-deletion concern.
- **Identity/auth (`users`) is fully separated from authorization (`tenant_memberships`).** A user with no memberships is a valid, if useless, row — this is intentional; it keeps account deactivation, password resets, and login independent of any tenant's business logic.
- **Store-level access is additive-restrictive, not additive-grant.** `membership_store_access` narrows a membership that already exists at the tenant level; it cannot grant access to a tenant the user has no membership in. This keeps the "no rows = full access" default safe (fewer rows can never mean more access) and keeps the common single-store case row-free.
- **`tenants.status` no longer has `cancelled`.** It conflated a billing fact (subscription cancelled) with a data-lifecycle fact (tenant archived). Only `trial | active | suspended | archived` remain; subscription state moves to a future `subscriptions` table.
- **The owner invariant is a transactional guarantee, not a convention.** A `trial` or `active` tenant can never reach zero active owners — enforced by a pair of `DEFERRABLE INITIALLY DEFERRED` constraint triggers (on `tenant_memberships` and on `tenants`), checked at transaction commit. This closes the "last owner accidentally removed, tenant becomes inaccessible" failure mode at the database layer rather than relying on application code to remember.
- **Phase 1 catalogue has no sharing.** `sellables.store_id` replaces the earlier tenant-level `sellables` with `source_store_id`, and `store_sellables` is removed. Sharing, `store_variants` and store-level pricing are deferred; the migration path is `store_id` → `source_store_id` plus a link table. This supersedes the earlier "no tenant-level catalogue entity" and "source store is always linked" decisions.
- **Selling price is on the variant.** `variants.base_price` replaces `sellables.base_price`, because variants of one sellable can be priced differently. Purchase cost never lives on `variants`.
- **`tenant_id` on every tenant-owned table, with composite FKs.** Parents expose `UNIQUE (tenant_id, ...)` keys and children reference `(tenant_id, parent_id)` pairs, so the database rejects any cross-tenant reference. `membership_store_access` was the one table that relied on an application-level same-tenant check instead — it now has a `tenant_id` column and the same composite-FK treatment as everywhere else (see the fix-pass entries at the end of this log).
- **Inventory is append-only, with one trigger-maintained cache.** `inventory_batches.received_quantity` is immutable, and the ledger (`stock_movements`) cannot be updated or deleted. `inventory_batches.available_quantity` is the one exception to "no mutable quantity column": it is a fast operational balance that only the ledger itself, via `trg_stock_movements_apply_to_batch`, is allowed to change — never an application-writable second source of truth. Because that update happens inside the same transaction as the ledger insert and is subject to `CHECK (available_quantity >= 0)`, the two cannot drift apart, and **this supersedes the earlier "negative on-hand is deliberately allowed" decision**: a movement that would oversell a batch now fails the whole transaction instead of being recorded as drift. See `stock_movements`' "Why an append-only ledger" section for the full reasoning.
- **Every Phase 1 quantity column is `INTEGER`: `purchase_items.quantity`, `inventory_batches.received_quantity`/`available_quantity`, and `stock_movements.quantity`.** An earlier draft of this decision kept `purchase_items.quantity` at `NUMERIC(12,3)` to leave room for a future fractional/weighed purchase line, while batch and ledger quantities were already `INTEGER` — that split was itself an unenforced gap (nothing stopped entering a fractional purchase quantity that could then never be fully reconciled into whole-number batches). Superseded: Phase 1 does not support fractional or weighed goods at all, so there is no partial exception to carve out; a future unit-of-measure model is the right place to introduce fractional quantities, not a NUMERIC column sitting unused until then.
- **`inventory_batches` has no `status` column.** The earlier `active`/`blocked`/`archived` states are superseded by `available_quantity` (zero means sold out) and by `DAMAGED`/`LOST` movements already removing bad stock from the operational balance. A distinct "held out of sale but otherwise fine" state is not modelled yet; it would be an additive column, not a redesign.
- **`variants` carries its own `store_id`, denormalised from `sellables` and FK-tied to it.** This lets `inventory_batches` enforce tenant/store/variant consistency with one direct composite FK to `variants`, instead of relying only on the transitive path through `purchase_items`. The same "denormalise the parent's store, then FK back to it" pattern `purchase_items.store_id` already used against `purchases`.
- **Selling price stays variant-first; the sellable is never asked for a price.** No schema change was needed here — `variants.base_price` and a price-less `sellables` were already the Phase 1 design — but the product-creation UX (variant name, SKU, attributes and price entered per-variant) is now an explicit, documented decision rather than an implicit consequence of the schema.
- **Purchase tax and sales tax are, and remain, separate concepts that never share a column.** `purchase_items.tax_amount` is scoped to tax paid to the supplier; `sale_items.tax_amount` (built in the sales phase) is scoped to tax collected from the customer — same column name, different table, unambiguous within each. `inventory_batches` carries only `unit_cost` (acquisition cost for valuation) — no tax field of either kind, absent a demonstrated accounting need.
- **`stock_movements.quantity` is unsigned; direction comes from `movement_type`.** Nine Phase 1 types (`PURCHASED`, `SOLD`, `PURCHASE_RETURN`, `SALE_RETURN`, `DAMAGED`, `LOST`, `INTERNAL_USE`, `PURCHASE_RETURN_REVERSAL`, `SOLD_REVERSAL`) each map to a fixed sign via `stock_movement_sign()`, rather than trusting each caller to supply a correctly-signed delta. `reference_type`/`reference_id` trace a movement back to its originating transaction and are deliberately not unique, since one transaction (a multi-line sale, a multi-batch receipt) can post several movements against the same reference — and now also because a reversal deliberately shares its original movement's `reference_id`.
- **`stock_movements` keeps `occurred_at` (business time) separate from `created_at` (record time).** They usually match, but corrections, delayed entry and future imports can legitimately post a movement whose `occurred_at` is in the past. Ledger and inventory-query indexes are built on `occurred_at`.
- **The ledger does not enforce "one `PURCHASED` movement per batch."** Receipt integrity (a batch is received exactly once) is a purchasing-workflow rule, checked by the deferred trigger on `inventory_batches` as an existence check, not a `stock_movements`-level uniqueness constraint — keeping the ledger's own shape independent of how any one business process happens to use it today.
- **A purchase line may be split into several batches — schema capability, not a Phase 1 workflow.** The rule is that batch `received_quantity` totals may not exceed the line's `quantity`; it is not an equality, so partial receipts and multiple batches per line are valid at the schema level, and future batch splitting fits the same shape. Phase 1's receiving UI only exposes the simple one-item-one-batch-received-in-full path — multi-batch/partial receiving isn't a feature a Phase 1 user can invoke, but the schema doesn't need a migration to expose it later. This distinction — schema capability vs. workflow exposure — is deliberate: it keeps Phase 1 simple in the UI without narrowing the database in a way that would need undoing.
- **Reconciled against a conversational recap that didn't match this document, and confirmed correct as documented (no schema change):** `purchase_items.discount_amount`/`tax_amount` stay absolute currency amounts, not percentages — the calculated value (e.g. `₹180`) is what has historical accuracy and reporting value, and stays correct even if tax *rates* change later; a rate/percentage field can be added alongside the amount in the future if reproducing the original calculation is ever needed, but isn't needed to store the amount itself. `idx_purchases_supplier_reference_unique` stays scoped to `(tenant_id, supplier_id, reference_number)`, not tenant-wide, because two different suppliers legitimately numbering their own invoices `INV-001` is normal and shouldn't collide.
- **`kind` is a coarse discriminator only.** `product` / `service` says whether stock can exist. Capabilities (F-01 facets) will be modelled as separate optional tables and are not replaced by `kind`.
- **Purchases and their history are frozen after receipt.** Lines are editable only while a purchase is `draft` or `ordered`; `received` and `cancelled` are terminal. Header totals are verified against the lines at commit.
- **A purchase return is a new document, never an edit to the original purchase.** `purchase_returns`/`purchase_return_items` point back at `purchases`/`purchase_items` and `inventory_batches` but never modify them; `purchases.status` has no `returned` value and never will — the return lives entirely in its own tables, so a purchase's original receipt history stays untouched no matter how many returns are later posted against it.
- **`purchase_return_items` reuses the existing stock-movement/available_quantity mechanism wholesale — no new trigger on `inventory_batches` was needed, and no new column either.** Posting a `PURCHASE_RETURN` movement decrements `available_quantity` and enforces the oversell floor exactly the way `SOLD` already does; posting a `PURCHASE_RETURN_REVERSAL` re-increments it the same way `PURCHASED`/`SALE_RETURN` do. The only genuinely new pieces are `purchase_return_items`' own referential-integrity trigger (batch ↔ purchase item ↔ purchase agreement, and preserved `unit_cost`) and the header-level completion/reversal completeness check on `purchase_returns`, both mirroring patterns `inventory_batches` already established for `PURCHASED`.
- **`reference_type='PURCHASE_RETURN'` resolves to the return *line* (`purchase_return_items.id`), matching how `PURCHASE_ITEM` already resolves to a purchase *line*, not a purchase header — and a reversal's movement reuses the same `reference_type`/`reference_id` as the return it reverses.** This was left unspecified when the `reference_type` enum was first written; building the actual return tables forced the resolution, and line-level was chosen for consistency across both reference types.
- **`reference_type='SALE_RETURN'` resolves to `sale_return_items.id`, the same line-level convention** — a `SALE_RETURN` `stock_movements` row's `batch_id` names the *new* return-origin batch it created, while `reference_id` traces back to the *original* return line that caused it, exactly the same two-different-things split `SOLD` already has between the batch it decremented and the `sale_items` line that drove it.
- **`purchase_return_items` gained a real lifecycle (mutable while `draft`, frozen from `completed` onward) — superseding the earlier "fully immutable and append-only" decision.** That earlier design assumed a return posts its stock effect the instant it's created, with no staging step; the actual requirement is a return can be *drafted* — items added, quantities adjusted — with zero inventory effect until it's explicitly completed. `purchase_return_items` now has `updated_at` and is editable (content columns only; identity columns stay locked) exactly while its parent `purchase_returns.status = 'draft'`, the same `require-open-parent` idiom `purchase_items` already uses against `purchases`. Once `completed`, it is exactly as immutable as the earlier decision described — the earlier design wasn't wrong about the destination, just about when immutability starts.
- **Purchase returns have a real three-state lifecycle — `draft → completed → reversed` — superseding the earlier `completed`/`cancelled` decision.** The earlier decision had no staging state (a return posted its movements the moment it was created) and no reversal concept (`cancelled` was a paperwork-only annotation that explicitly did *not* undo stock). The actual requirement needed both: a draft stage with no inventory effect, and a real reversal that restores exactly what a completed return removed via a compensating `PURCHASE_RETURN_REVERSAL` movement, never by editing or deleting the original. `reversed` is terminal (no edge leaves it), which is what makes "a completed return can't be reversed twice" true without extra bookkeeping — a second reversal attempt is just an illegal transition, rejected the same way any other disallowed status change is.
- **`purchases.status` transitions are now validated edge by edge, not just by blocking changes away from the two terminal states.** The original guard only stopped `received`/`cancelled` from changing further; it did not stop an illegal direct `draft → received` jump, since `draft` was never in the blocked-`FROM` list. `trg_purchases_guard_update` now enumerates exactly the four allowed edges (`draft→ordered`, `draft→cancelled`, `ordered→received`, `ordered→cancelled`) and rejects everything else, which is what makes "a purchase can't be cancelled once inventory has arrived" a structural guarantee rather than an incidental side effect: no batch can exist before `status='received'`, and once `received`, `cancelled` is no longer a reachable edge.
- **The minimal `sales`/`sale_items` stub is now the real Phase 1 sales design, superseding it entirely.** The stub existed only to give `customers`/`sale_payments`/`customer_credit_ledger` something to reference; it had a single-value `status` (`'completed'` only), no lifecycle, no batch integration. It has been replaced with a full `draft → completed → voided` state machine, `sale_item_batches` as the batch-allocation layer, and `SOLD`/`SOLD_REVERSAL` `stock_movements` integration — see the entries below.
- **Fixed a real ordering bug the stub carried:** `sales.customer_id` FKs into `customers`, but `customers` was documented *after* `sales`. Tables in the customers/payments/sales phase are now in dependency order (`customers` → `payment_methods` → `payment_accounts` → `sales` → `sale_items` → `sale_item_batches` → `sale_payments` → `customer_credit_ledger`), so the DDL is valid read top-to-bottom, not just as presentation.
- **`sales` gets the same `draft → completed → voided` edge-by-edge transition guard as `purchases`/`purchase_returns`, plus a header/line totals-reconciliation trigger mirroring `purchases`/`purchase_items` exactly.** That totals guard does double duty: it keeps `subtotal_amount`/`discount_amount`/`tax_amount` in sync with `sale_items` while draft, *and* is what prevents those columns drifting after `sale_items` freeze at completion — no separate "lock the money columns" rule was needed, the same elegant side effect `purchases`' own totals guard already provides.
- **`sale_item_batches` is the new batch-allocation layer, deliberately allocation-strategy-agnostic.** A `sale_items` row is the commercial line (a variant and a quantity); which physical batch(es) fulfil it is this table's job, whether the app got there by a barcode scan (the batch is already known, no FIFO) or by a variant-first FIFO search. Nothing on this table records *which* strategy was used — a barcode-scanned row and a FIFO-allocated row are indistinguishable in shape, which is exactly what lets FIFO become FEFO later (once expiry-enabled inventory exists) without a schema change.
- **`sale_item_batches` allocations may not exceed a sale item's quantity at any time (checked continuously), but are only required to equal it at sale completion (checked once, at that transition).** A draft cart is normal, unfinished, partially-allocated state; the ceiling check catches an over-allocation mistake immediately, while the exact-match requirement is deferred to `sales`' completion guard, the same two-tier pattern (continuous ceiling, completion-time floor/equality) already used for `inventory_batches`' own receipt-vs-purchase-line rule.
- **`SOLD_REVERSAL` was added as a ninth `stock_movements` type for voiding a completed sale, deliberately not reusing `SALE_RETURN`.** `SALE_RETURN` is a customer physically returning goods (via a completed `sale_return`, built alongside `sale_returns`/`sale_return_items` — see those tables); voiding is a cashier undoing an erroneous transaction, often the same day. Both add stock back, but they are different business events, and collapsing them into one movement type would lose that distinction in the ledger permanently.
- **`sale_payments` (and, by necessity, `sale_items`/`sale_item_batches`) are no longer append-only outright — they're mutable while `draft`, frozen from `completed` onward, the same idiom `purchase_return_items` already established, superseding the earlier "append-only, same reasoning as `stock_movements`" decision.** That earlier design assumed payments were only ever recorded against an already-final sale, because the sales stub had no draft concept yet. The real lifecycle needs a cart-building stage where items, quantities and payment allocations are all still changing — so the completeness checks that used to live on `sale_payments` itself (`trg_sale_payments_credit_guard`) moved to `sales`' own completion guard, which is the only place that actually knows when "still being built" ends and "final" begins.
- **The "payments must sum to the sale total" rule is now enforced, at completion — a real requirement supersedes the earlier "left open for future split payments" decision.** `sales`' completion guard checks `SUM(sale_payments.amount) = sales.total_amount` at the `draft → completed` transition, not continuously. This doesn't foreclose future split/partial payment: a sale can carry any number of partial payments while still `draft`, exactly the "split payment" shape — the rule only bites at the moment of completion, which is precisely when "is this sale actually paid for" needs a real answer.
- **`customer_credit_ledger` gained `reverses_entry_id`, a real self-referencing FK with an amount/customer validation, closing the "reversal linkage is loose" gap flagged when this table was first designed.** A `CREDIT_REVERSAL` now must name the exact entry it undoes, must exactly negate its amount, and must match its customer — verified on insert, not just documented as a convention — and a partial unique index guarantees an entry is reversed at most once.
- **Concurrency safety for sale completion needed no new mechanism.** The plain `UPDATE` inside `trg_stock_movements_apply_to_batch` already takes a row lock on the batch being sold from; two concurrent sales serialize on that lock, and `CHECK (available_quantity >= 0)` is what actually stops the oversell. This is the same guarantee `PURCHASE_RETURN` and `PURCHASE_RETURN_REVERSAL` already relied on, reused a third time rather than reinvented for sales.
- **`customers` is tenant-level, not store-level**, unlike `sellables`/`variants`/`inventory_batches`. A customer can be attributed to a sale at any of the tenant's stores; nothing about a customer's identity is store-scoped, so it doesn't carry a `store_id` at all.
- **No lifetime-spend or credit-balance columns on `customers`, ever, as a matter of principle already established elsewhere in this schema.** Purchase history is a query over `sales`/`sale_items`; credit balance is a query over `customer_credit_ledger` (`customer_credit_balance` view). This is the same "no independently-writable cached fact" rule `available_quantity` had to earn a narrow, trigger-only exception to — `customers` gets no exception at all.
- **`payment_methods` and `payment_accounts` model two different questions and are never merged into one field.** Method answers *how* (tenant-level, small vocabulary, `UPPER_SNAKE_CASE` codes matching this schema's other enum-like values); account answers *where* (store-level, user-named, lowercase-slug codes matching `stores.code`). Both use a reversible `active`/`disabled` toggle rather than the terminal `archived` pattern used elsewhere, because disabling a payment rail is an ordinary settings change, not a lifecycle event — and neither table ever stores credentials.
- **`sale_payments.payment_account_id` is nullable for exactly one reason: `CUSTOMER_CREDIT`.** A credit-flagged payment method (`payment_methods.is_customer_credit`) represents a receivable, not money landing anywhere, so `trg_sale_payments_validate` requires every other method to name a real account and requires a credit method *not* to. This is the schema-level expression of "do not treat customer credit as cash received into a bank/cash account."
- **`customer_credit_ledger` remains fully append-only** (unlike `sale_payments`, which is now draft-mutable — see above): every entry is a posted financial fact the moment it's inserted, since nothing analogous to a "draft" ledger entry exists or should exist. A mistake is corrected with a new compensating entry (`CREDIT_ADJUSTMENT` or `CREDIT_REVERSAL`), never by editing or deleting the original.
- **`customer_credit_ledger.amount` is signed, deliberately breaking from `stock_movements.quantity`'s unsigned-plus-sign-function convention.** The requirement specified the sign convention directly with worked positive/negative examples, a different shape of spec than `stock_movements` had; `CREDIT_SALE`/`CREDIT_PAYMENT` still have their sign hard-`CHECK`ed, while `CREDIT_ADJUSTMENT`/`CREDIT_REVERSAL` are deliberately left free to go either direction, since a correction must be able to undo a mistake regardless of which way the mistake went.
- **A `CREDIT_PAYMENT` is never a `sale_payments` row.** `sale_payments.sale_id` is `NOT NULL` — every row there is a payment against a specific sale. Paying down an old balance isn't a new sale, so it lives purely in `customer_credit_ledger` with `sale_id`/`sale_payment_id` both `NULL`. Only `CREDIT_SALE` (born from a `sale_payments` row) ties back to a sale at all.
- **Reconciled the sales design against a follow-up review and confirmed five things as-built, with one schema addition.** `SOLD_REVERSAL`/`SALE_RETURN` stay separate movement types (different business events — a cashier voiding vs. a customer returning — even though both restore stock); no-reservation-during-`draft` stays as designed (availability is only re-checked at completion, not reserved when a cart is opened); "payments sum to the total" stays a completion-only check, not continuous; `sale_number` stays permanently unique once assigned, even through a later void; and actual payment reversal/refunds stay explicitly deferred to the future `sale_returns` work, not retrofitted into the current model. The one actual change: **`sales` gained a nullable `void_reason TEXT` column**, deliberately free text rather than an enum (nothing in Phase 1 needs it as structured data), settable only in the same `UPDATE` that performs the `completed → voided` transition (`sales_void_reason_pair_check` plus an extra `sales_guard_update()` clause), and frozen thereafter.
- **`sale_returns`/`sale_return_items` are built, closing the "sale returns" gap the sales phase deliberately left open.** A return always originates from an existing `completed` sale — `sales` → `sale_items` → `sale_item_batches` remains the sole source of truth for what was bought, no separate customer-purchase-history table was added, and `sale_returns` carries no `customer_id` of its own (the customer relationship stays `Customer → Sale → Sale Return`, reachable through `sale_id`). `draft → completed` is the whole lifecycle; unlike `purchase_returns`, there is no `reversed` state (explicitly out of Phase 1 scope — see "Future path"), and no refund/payment reversal happens here either (`sale_return_items` carries no money columns, by design — the refundable amount is derived from the frozen original `sale_items` row it points at, for a future refund system to use).
- **`inventory_batches` now has two possible origins, purchase or sale return, enforced by one `CHECK` and never both at once.** This is a real, deliberate widening of a table the sales-return requirement explicitly asked not to be redesigned — but "redesign" and "this specific additive change" turned out to be different things: a return batch has to be a first-class `inventory_batches` row (own barcode, own `available_quantity`, same `stock_movements` integration) for barcode scanning, reselling and future clearance handling to treat it identically to a purchase-origin batch, which a separate return-batch table could not do without duplicating `inventory_batches`' entire machinery or widening `stock_movements`/`sale_item_batches`' batch FKs to point at two different tables. `purchase_item_id` became nullable, `sale_return_item_id` was added alongside it, and `trg_fn_inventory_batches_insert_guard` now branches on which one is set — everything else about the table (barcode uniqueness, the `available_quantity` trigger, the `REVOKE`-hardened immutability rule) is completely unchanged and applies identically to either origin.
- **The `inventory_batches` → `sale_return_items` FK is added by a standalone `ALTER TABLE`, not inline in `inventory_batches`' own `CREATE TABLE`.** `inventory_batches → sale_return_items → sale_item_batches → inventory_batches` is a genuine circular reference, not merely a documentation-ordering problem the way `customers`/`sales` was earlier in this phase — a `FOREIGN KEY` clause needs its target table to already exist, and `sale_return_items` is necessarily documented after `sale_item_batches`, which is necessarily documented after `inventory_batches`. The column, its own `UNIQUE` constraint, and the two-origin `CHECK` are all still declared inline, since none of them reference another table; only the cross-table `FOREIGN KEY` had to move.
- **A sale with a completed return can never be voided, and a return can never complete against a sale that's no longer completed — both directions of the same guard.** Voiding restores the *full* originally-sold quantity via `SOLD_REVERSAL`; a completed return has already restored part or all of that same quantity via its own new batch, so allowing both would double-count stock (10 sold, 4 returned, then voided would wrongly restore 10 on top of the 4 already back, for 14). `sales_guard_update()` blocks `completed → voided` if a `completed` `sale_returns` row exists against the sale; `sale_returns`' own completion guard re-checks, at commit, that the sale is *still* `completed` (not just was, at draft creation) — necessary specifically because a sale's `completed` status, unlike a purchase's `received` status, is not terminal.
- **The over-return ceiling is checked once, at a return's own completion, against completed returns only — no reservation during draft, mirroring the sales design's own choice exactly.** Two draft returns can be built against overlapping quantities from the same original batch allocation; whichever completes first succeeds, and the second fails its own completion guard with a clear error, rather than either being blocked at draft time or silently reserving stock.
- **`sale_item_batches` gained a second unique target, `(tenant_id, store_id, id, sale_item_id, variant_id)`, purely so `sale_return_items` has something valid to reference.** This adds no behavior to `sale_item_batches` itself — it's a superset of the existing `sale_item_batches_sale_item_fk`'s own shape, just exposed as a constraint another table's FK can point at.
- **`variants.status`'s `archived` value was renamed to `deactivated`, and it — along with `sellables.status` — was made explicitly a freely reversible catalogue toggle, correcting an earlier, overstated cross-reference** (`customers`' Notes had called it "the standard terminal soft-delete pattern, same as suppliers, sellables, variants," which was never accurate for these two: neither table has ever had a status-transition guard trigger). The rename gives variant deactivation its own vocabulary, distinct in weight from a sellable being archived, matching how the requirement described the two: archiving reads as "no longer offered or maintained," deactivating reads as "temporarily not sellable, stock untouched." Both remain plain columns either value can be set on at any time; reactivation is just flipping it back, nothing to repair.
- **Sales eligibility (`sellable.status = 'active' AND variant.status = 'active'`) is enforced by one new trigger on `sale_items`, not a `CHECK` constraint.** A `CHECK` can't span two tables, and there was already exactly one place both selling flows (barcode-first and variant-first) converge before touching inventory — the `sale_items` insert. `trg_sale_items_require_active_variant` fires on `INSERT` and on a `variant_id` change (the only way a sale item's eligibility could ever change), leaving `sale_item_batches`, `purchase_items` and `sale_return_items` untouched: purchasing was never in scope, and a return must always be acceptable regardless of current catalogue status, the same "never break history" principle the rest of this schema already lives by.
- **Archiving a sellable never cascades a status write to its variants, by design, not by omission.** The requirement was explicit about this, and it falls out naturally from checking both columns independently at the point of sale rather than trying to keep them in sync: a variant can stay `active` on its own row while its parent sellable is `archived` and still correctly fail the eligibility check, because the check reads both tables itself. No trigger was added to `sellables` to rewrite `variants.status`, and none is needed.
- **Two additive, status-filtered indexes** — `idx_sellables_store_status` and `idx_variants_store_status`, both `(tenant_id, store_id, status)` — were added for catalogue-lifecycle filtering and the new eligibility trigger's lookup. Barcode lookup and tenant isolation needed nothing new: `inventory_batches_tenant_barcode_unique` (from the catalogue/inventory phase) and the composite tenant/store FKs throughout already covered both origins.
- **The barcode model itself required no schema change** — `inventory_batches.barcode`, its tenant-scoped uniqueness, and the purchase-vs-return origin split (from the sale-returns phase) already satisfied every requirement here (batch-level identity, opaque string storage, no assumed symbology, a new barcode per return batch, never a reused one). This phase's work on barcodes was entirely documentation: consolidating the barcode → batch → variant → sellable chain and the scan-to-sale lookup sequence into one place ("Product/variant lifecycle and the barcode model") rather than leaving it scattered across `inventory_batches`' and `sale_item_batches`' individual notes.

### Audit fix pass

A full Phase 1 audit (relationships, tenant isolation, inventory integrity, concurrency, state machines, money/tax, scope) was run against everything above and turned up nine issues, all fixed here without changing any existing business rule, lifecycle state, or table's core shape:

- **(Blocker) `sale_returns`' over-return check is now lock-protected, closing a real concurrent-completion race.** The ceiling check in `trg_fn_sale_returns_completion_guard` was a plain aggregate `SELECT` with no lock — two completions racing against the same original `sale_item_batches` allocation could each read the same "already returned" total, each independently pass, and together over-return it. It now takes `SELECT ... FOR UPDATE` (ordered by `id`, to avoid a cross-completion deadlock) on every affected `sale_item_batches` row before computing the sum, the same `FOR SHARE`-before-aggregate idiom `check_tenant_has_active_owner` already used for the owner invariant. The "Concurrency and stock safety" section's claim that "no explicit `SELECT ... FOR UPDATE` is needed anywhere in this design" was accurate for the `available_quantity`-counter shape of check it was describing, but not universally true — corrected to say so, now that a second shape of check (a fresh aggregate over sibling rows, with no counter column to lock through) exists and needs its own explicit lock.
- **Row-level security is now actually implemented, not just asserted.** Every table's notes have said "RLS scoped to `tenant_id` per N-05" since the first draft of this document, but no `CREATE POLICY` ever existed. "Row-level security" (new section, right after `membership_store_access`) defines the tenant-context mechanism (two `SET LOCAL` session settings, `app.current_tenant_id`/`app.current_user_id`, populated by the application from an already-verified JWT claim — never invented or trusted blind) and enables + policies all 22 tenant-owned tables with one consistent `USING`/`WITH CHECK` pattern. `tenants` is deliberately left out (it isn't tenant-owned, and its own access model was already documented as a deferred platform-admin decision); `users` gets a membership-or-self policy instead of a column comparison, since it has no `tenant_id` by design — and account creation is explicitly flagged as outside what this policy can authorize, same as the credential store itself is outside this schema.
- **`membership_store_access` gained a real `tenant_id` column and composite FKs, closing the one remaining app-level-only tenant check in the whole schema.** `(tenant_id, membership_id) → tenant_memberships` and `(tenant_id, store_id) → stores` together make a membership from tenant A paired with a store from tenant B structurally impossible, not just discouraged — either FK fails outright. `tenant_memberships` gained the `UNIQUE (tenant_id, id)` target this required (Postgres requires a unique constraint on anything a composite FK references); this is additive, not a change to any existing constraint. This also finally gives the table a normal column for the RLS policy above — before this fix it couldn't have one.
- **Reversal-type stock movements (`SOLD_REVERSAL`, `PURCHASE_RETURN_REVERSAL`) now have a real uniqueness guarantee**, via `idx_stock_movements_reversal_unique` on `(batch_id, movement_type, reference_type, reference_id)`, scoped only to those two types. `customer_credit_ledger` always had this for its own reversals (`idx_customer_credit_ledger_reverses_entry_unique`); the ledger never had the equivalent, relying only on the completion/void guards' existence checks ("at least one matching movement exists"), which can't by themselves stop a retried or double-submitted request from posting the same compensating movement twice. `PURCHASED`/`SOLD`/`SALE_RETURN`/`PURCHASE_RETURN` are deliberately left out of this index — their legitimate multiplicity (multi-batch receiving, repeat sales from one batch, multiple partial returns) is real and already documented, and none of that changes.
- **`sale_items` gained the store/variant consistency trigger `purchase_items` always had, closing an asymmetry between two otherwise-mirrored tables.** `purchase_items_validate_variant` has always rejected a line whose variant belongs to a different store at insert time, with a clear error. `sale_items` had no equivalent — a mismatched row wasn't rejected there at all, only indirectly, much later, when `sale_item_batches`' own FK could never find a matching batch for it, surfacing as a confusing FK violation or a sale permanently stuck unable to complete. `trg_sale_items_validate_variant_store` gives it the same immediate rejection, fired on `INSERT` and on a `variant_id` change (the only way the mismatch could ever be introduced, since `store_id` itself is already immutable here).
- **The "Relationship rationale" table now documents `sale_returns`/`sale_return_items`**, which were fully built (previous phase) but never added to this table. Five rows added: `sales 1:N sale_returns`, `sale_returns 1:N sale_return_items`, `sale_items 1:N sale_return_items`, `sale_item_batches 1:N sale_return_items`, and the reverse-direction `sale_return_items 1:N inventory_batches` (a completed return line *creates* its return batch, rather than pointing at a pre-existing one).
- **`idx_inventory_batches_purchase_item` now leads with `tenant_id`**, matching every other index in this schema. Functionally redundant (the column is already a globally unique UUID) but now consistent, and able to benefit from the same RLS-aware query planning every sibling index gets.
- **Tenant provisioning's required order is now stated as a hard requirement, not an open question.** The "owner invariant" section previously ended in "Open item... worth confirming with whoever builds signup/onboarding." It now states plainly: create the tenant row and its first `owner`/`active` membership in one transaction, tenant first, membership second, same transaction — `trg_tenants_owner_guard`'s deferred check is exactly what makes that ordering work. No schema change; this was always true of the existing trigger, just not written down as a requirement before.
- **`stores.status`'s three values, versus the two-value catalogue entities one level down, now has a stated reason** rather than being left for a reader to wonder about: a store is a whole operational unit that can be temporarily paused (`suspended`) distinct from permanently closed (`archived`), while `sellables`/`variants` don't need a third state because their two-value status is *already* a freely reversible toggle, and `customers`/`suppliers` have no demonstrated need for a "paused" state at all.

### DB readiness pass: privilege model and RLS bootstrap

- **The application-role privilege model is now concrete: `app_owner` (owns every object, `NOLOGIN`, migrations only) and `app_role` (the live connection role, no special attributes, RLS and grants are its entire boundary).** Every `REVOKE`/`GRANT` note elsewhere in this document used to reference an unnamed `<app_role>` in prose only; "The application-role privilege model" (under "Row-level security") now names both roles and grants every one of the 24 tables (22 RLS tables + `users` + `tenants`) exactly the privilege set its own documented lifecycle needs — full CRUD for ordinary mutable headers, `+DELETE` for genuinely draft-deletable line items, `SELECT`/`INSERT` only for append-only ledgers and `tenants`, `SELECT`/`UPDATE` only for `users` (no direct `INSERT` — see bootstrap, below). No table's actual business rules changed; this makes the privilege boundary match rules that were already true.
- **`inventory_batches` gets no `UPDATE` grant at all, not a column-restricted one — stronger than the original "`REVOKE` the `available_quantity` column" prose, and still exactly compatible with it.** Tracing `trg_inventory_batches_prevent_core_change` shows no column on this table has a legitimate direct-from-`app_role` `UPDATE` path at all (every other column is immutable post-insert; `available_quantity`/`updated_at` are trigger-only) — so withholding the grant entirely is simpler and strictly safer than a column-level carve-out, while an explicit `REVOKE UPDATE (available_quantity)` is still stated for the same reason the sign-shaped `CHECK` constraints are stated even where a narrower one would technically do: explicit beats implicit for anything a security review will specifically look for.
- **Verified, not assumed, that `app_role`'s missing grants don't break any existing trigger.** `SECURITY DEFINER` functions (and anything they go on to fire, including other plain triggers on the same table, like `trg_inventory_batches_set_updated_at`) execute under the *function owner's* privileges for the duration of the call, not the original caller's — this is the same mechanism the original `trg_fn_stock_movements_apply_to_batch` note already leaned on, just confirmed end-to-end now that the roles and grants are concrete rather than placeholders.
- **The RLS bootstrap gap — how a brand-new signup ever gets a `users`/`tenants`/`tenant_memberships` row when no session can exist yet — is resolved by one narrowly-scoped `SECURITY DEFINER` function, `provision_new_account()`, not by weakening `app_role` or the `users`/`tenant_isolation` policies.** It takes no caller-supplied tenant or user id to attach to — it only ever creates a brand-new, self-contained user+tenant+owner-membership triple and returns the three new ids — so it cannot be used to read or write an existing tenant's data. `app_role` is granted `EXECUTE` on this one function; it still has no direct `INSERT` on `users` at all. An already-authenticated user opening an *additional* tenant needs no such function — `tenants` carries no RLS policy to begin with, so the application just creates the tenant and switches `app.current_tenant_id` to it, in the same transaction, before the ordinary RLS-governed `tenant_memberships` insert.
- **Invite acceptance has the identical cold-start shape and is named, not solved, here.** It needs its own equally-narrow `SECURITY DEFINER` function (create the `users` row, update the one already-`invited` membership row a validated token names) — flagged explicitly as future work following the exact same template, rather than silently left unaddressed or papered over by widening `provision_new_account` to do something it wasn't designed for.
- **Reviewed the full RLS + privilege design together, specifically for ownership-based bypass, over-powerful roles, `SECURITY DEFINER` escape paths, and the bootstrap edge cases — none found beyond what's now documented and deliberately scoped.** `app_role` has no `BYPASSRLS`/superuser/ownership attribute; both `SECURITY DEFINER` functions in this schema (`trg_fn_stock_movements_apply_to_batch`, `provision_new_account`) are narrow, parameterized only with values that can't redirect them at pre-existing rows, and both set an explicit `search_path`; `membership_store_access`'s cross-tenant protection (previous pass) is unaffected and gets the standard policy like everything else; no contradiction found between any RLS policy and the tenant/membership/store FK relationships it sits on top of.

## Up next

The core sales transaction, sale returns, the product/variant lifecycle and barcode model, a full audit fix pass, and now a complete privilege/RLS-bootstrap pass are all built and documented — the database design is implementation-ready. What's still deliberately left for later (see "Future path" above for each): a `sale_payments`/refund reversal mechanism for actual money already received (the biggest remaining financial gap), sale return reversal, returned-batch condition/classification, deactivated/archived-stock workflows (clearance, offers, disposal, special resale), store-specific price overrides and price history, FEFO allocation once expiry-enabled inventory exists, and the invite-acceptance bootstrap function (named, same template as signup, not yet built out). Next up: folder structuring.
