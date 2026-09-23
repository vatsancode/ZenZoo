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
- **RLS** — `tenants` is the one table *without* a `tenant_id` column (it *is* the tenant), so it sits outside the standard per-tenant RLS pattern used elsewhere (N-05). Access should instead be gated by a platform-admin role/claim, decided when the auth model is designed.
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
- Deliberately **excluded**: password hash / auth provider fields (belongs to whatever auth system — Supabase Auth, Clerk, custom — is chosen; this table models the user record the app owns, not the credential store), and anything tenant- or role-shaped.

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
- **`status`** — mirrors the tenant pattern: `archived` is the soft-delete terminal state, no `deleted_at`.
- **RLS** — standard pattern applies here (N-05): policy scoped to `tenant_id` matching the caller's tenant claim.

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
        )
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
- **RLS** — scoped to `tenant_id` per N-05, same as every other tenant-owned table.

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
$$ LANGUAGE plpgsql;

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

**Why deferred, specifically:** because the check runs at `COMMIT` (or at an explicit `SET CONSTRAINTS ... IMMEDIATE`) rather than after each individual statement, an atomic "swap owner" — `UPDATE ... SET role='manager' WHERE id=<old-owner>` then `INSERT ...` a new owner row, both inside one transaction — passes, because only the *final* state at commit is checked. A bare single-statement removal of the last owner (the common accidental case) still fails, because in autocommit mode each statement is its own transaction and the deferred check fires at the end of it. This is the standard Postgres pattern for exactly this shape of invariant — an aggregate condition over sibling rows that a row-level `CHECK` cannot see.

**Open item:** the freshly-created-tenant path needs to insert the tenant row and its first owner membership in the same transaction (tenant starts `trial`, which already requires an owner under this rule) — the tenant-provisioning flow must account for that ordering, or provisioning always fails at the first commit. Worth confirming with whoever builds signup/onboarding before this ships.

---

## `membership_store_access`

Restricts a tenant membership to specific stores. **Absence of rows for a membership means access to all stores in the tenant** — this table only ever narrows, never grants beyond what the membership's tenant already implies.

```sql
CREATE TABLE membership_store_access (
    id                  UUID PRIMARY KEY DEFAULT uuidv7(),
    membership_id       UUID NOT NULL REFERENCES tenant_memberships (id),
    store_id            UUID NOT NULL REFERENCES stores (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT membership_store_access_unique UNIQUE (membership_id, store_id)
);

CREATE INDEX idx_membership_store_access_membership_id ON membership_store_access (membership_id);
CREATE INDEX idx_membership_store_access_store_id ON membership_store_access (store_id);
```

### Notes

- **No `updated_at`** — rows here are grants, not mutable records; you add or remove a row rather than editing one. No `role_override` column yet either — the design leaves room for one (a manager tenant-wide but only cashier-level at a second store) without needing a migration to add the column when that need actually arrives.
- **Application-level responsibility**: enforce `stores.tenant_id = tenant_memberships.tenant_id` for the referenced membership — a plain FK can't express "same tenant on both sides" across two tables. Worth a `CHECK` via a small trigger if this constraint is ever violated in practice; not adding it preemptively.
- Owners and managers with tenant-wide access simply have zero rows here. This keeps the common case (a single-store shop, one owner, maybe one cashier) free of any rows in this table at all.

---

## Phase 1: catalogue, purchasing and inventory

Scope is deliberately small: **one operational store uses stock at this stage.** Every table is still tenant- and store-aware so multi-store can be added later. Out of scope for Phase 1: catalogue sharing between stores, store-to-store transfers, `store_sellables`, `store_variants`, store-level pricing, and individual-unit (serial) tracking.

```text
Tenant
  └── Store
        ├── Sellables
        │     └── Variants
        ├── Purchases (also belong to a Supplier)
        │     └── Purchase Items ──► Variant
        └── Inventory Batches ──► Variant, Purchase Item
              └── Stock Movements (append-only ledger)
```

```text
Purchase → Purchase Item → Variant
                 └── Inventory Batch(es) ← Stock Movements
```

**Conventions used by every table below**

- `tenant_id` is an explicit column on every table, for RLS (N-05), composite foreign keys and tenant-scoped uniqueness. Tenant isolation is not left to a join through `stores`.
- Each parent exposes a `UNIQUE (tenant_id, ...)` key, and each child references `(tenant_id, parent_id)`. The database therefore rejects any row that points at another tenant's parent.
- Soft-delete via a terminal `status`, no `deleted_at`, as elsewhere. The exceptions are draft purchase lines (working data, deletable while the purchase is open), `stock_movements` (never deleted, never updated), and `inventory_batches` (no `status` column at all — see its notes).
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
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CONSTRAINT variants_status_check
                            CHECK (status IN ('active', 'archived')),
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

- **`base_price` is the selling price and lives on the variant**, because Red/6m and a plain 3m variant can be priced differently. It is the master selling price for Phase 1; a later store-level override would sit on top of it without changing this column.
- **Variant-first commercial UX.** A variant is created with its own name, SKU, attributes and `base_price` — the sellable is the umbrella grouping ("Silk Saree") and is never asked for a price. `Red/6m → ₹2,000`, `Blue/6m → ₹2,300`, `Green/6m → ₹1,900` are three variant rows under one sellable, each independently priced.
- **`name`** is the human label ("Red / 6m") and today doubles as where free-text "attributes" (colour, size, etc.) live. Structured option axes as their own columns are a future `variant_options` design using real tables, not a JSONB blob — that decision is unchanged by variant-first UX; the UX is about *where the user enters the data*, not about how it is normalised in the schema.
- **`sku`** is unique per tenant. Manufacturer barcodes (EAN) are a separate future `variant_barcodes` table; the barcode on `inventory_batches` is something else (see the comparison table below).
- **`store_id` is denormalised from the sellable, on purpose** — same pattern as `purchase_items.store_id`. It exists so `inventory_batches` (and any future table hanging off a variant) can enforce tenant/store consistency with a direct composite FK, instead of only transitively through a join to `sellables`. The composite `variants_sellable_fk` still ties `store_id` to the parent sellable's own store, so the two can never disagree — this is not a second, independently-editable store assignment.

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

-- tenant/store never change; received and cancelled are terminal
CREATE FUNCTION purchases_guard_update() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.store_id <> OLD.store_id THEN
        RAISE EXCEPTION 'purchases tenant_id and store_id are immutable (purchase %)', OLD.id;
    END IF;
    IF OLD.status IN ('received', 'cancelled') AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'purchase % is % and cannot change status', OLD.id, OLD.status;
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

- **Lifecycle:** `draft` → `ordered` → `received`, or `cancelled` from `draft`/`ordered`. `received` and `cancelled` are terminal. A goods return after receipt is a future purchase-return document, not a status change. `received_at` is set exactly when the status is `received`.
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
- **`tax_amount` here is *purchase* tax — tax paid to the supplier — and it stays scoped to this table.** There is no generic, shared `tax` concept anywhere in this schema: purchasing and sales are different transactions with different tax treatment (input tax vs. output tax), so a future `sale_items` table gets its own `sales_tax_amount` column, never a column shared with `purchase_items`. Neither concept lives on `inventory_batches`, which only ever stores acquisition cost (`unit_cost`) — see that table's notes.
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
    purchase_item_id    UUID NOT NULL,
    barcode             VARCHAR(64) NOT NULL,
    -- how many arrived — immutable, whole units only
    received_quantity   INTEGER NOT NULL
                            CONSTRAINT inventory_batches_received_quantity_check
                            CHECK (received_quantity > 0),
    -- how many are here now — mutable, maintained ONLY by the stock_movements trigger below
    available_quantity  INTEGER NOT NULL DEFAULT 0
                            CONSTRAINT inventory_batches_available_quantity_check
                            CHECK (available_quantity >= 0),
    -- acquisition cost basis for inventory valuation. No tax field here — see notes
    unit_cost           NUMERIC(12,2) NOT NULL
                            CONSTRAINT inventory_batches_unit_cost_check CHECK (unit_cost >= 0),
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- a barcode identifies exactly one batch within the tenant
    CONSTRAINT inventory_batches_tenant_barcode_unique UNIQUE (tenant_id, barcode),

    -- target for stock_movements: a movement must agree with its batch on tenant, store AND variant
    CONSTRAINT inventory_batches_movement_target_unique
        UNIQUE (tenant_id, store_id, id, variant_id),

    -- tenant, store and variant must all match the purchase line that produced the batch
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

-- purchase-item lookup (traceability: purchase → purchase item → its batches)
CREATE INDEX idx_inventory_batches_purchase_item ON inventory_batches (purchase_item_id);

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
       OR NEW.purchase_item_id <> OLD.purchase_item_id
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

-- checked at commit, so the batch and its receipt movement can be inserted in either order
CREATE FUNCTION trg_fn_inventory_batches_insert_guard() RETURNS TRIGGER AS $$
DECLARE
    v_purchase_status VARCHAR(20);
    v_item_quantity   INTEGER;
    -- SUM() over an integer column returns bigint
    v_received_total  BIGINT;
BEGIN
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

- **One purchase line → many batches.** The rule is *the batches' `received_quantity` together may not exceed the line's `quantity`*. It is deliberately **not** an equality. A partial receipt, or a line split into several batches (each with its own barcode), is valid. Over-receipt is rejected: if the supplier shipped 52 against an order of 50, correct the line to 52 first, so the record shows what really arrived. `purchase_item_id` stays a plain (non-unique) FK for exactly this reason — one purchase item can and will produce more than one batch.
- **Same variant, different costs.** `Red Silk Saree / 6m` can have Batch A (50 units at ₹1,500, barcode A) and Batch B (30 units at ₹1,650, barcode B). They are different rows under the same `variant_id`, each with its own barcode and cost basis.
- **`unit_cost` on the batch is the cost basis of that stock, and only that.** It starts as the purchase line's cost and is immutable. It is a separate column from `purchase_items.unit_cost` because the effective cost per unit can later include allocated discount, tax or freight, and because margin and cost-of-goods reporting must never depend on a line that could be edited. **No purchase-tax or sales-tax field lives here** — tax is a transaction-side concept (`purchase_items.tax_amount` today, a future `sale_items.sales_tax_amount`), and the batch tracks acquisition cost for valuation, not tax. If inventory valuation is ever demonstrated to need a tax-inclusive cost basis, that is a deliberate follow-up decision, not a default.
- **`received_quantity` is immutable and whole-number only**: it is how many units arrived, not how many remain. `purchase_items.quantity` upstream is `INTEGER` too, so there is no fractional-to-whole boundary to reconcile anywhere in Phase 1 — every quantity column in the purchasing → batch → ledger chain is whole units, consistently. Weighed or fractional goods are not a Phase 1 concept at all; supporting them later means designing a proper unit-of-measure model (a unit column, a conversion/precision scheme) rather than quietly widening these columns back to `NUMERIC`.
- **`available_quantity` is the current operational balance, and the *only* mutable column on this table.** It starts at `0` and is changed **exclusively** by the `stock_movements` trigger described in that table's section below — never by a direct application `UPDATE`. A batch's first `PURCHASED` movement is what brings it from `0` up to `received_quantity`, using the exact same code path as every later `SOLD`, `DAMAGED`, `SALE_RETURN`, etc. — there is deliberately no special-cased "set available_quantity at batch creation" logic. See "Batch balance vs. the ledger" under `stock_movements` for why this can't drift from the ledger, and why `CHECK (available_quantity >= 0)` is a real, enforced backstop rather than a hopeful comment.
- **`REVOKE` is the second line of defence for `available_quantity`, same idiom as `stock_movements`.** `trg_inventory_batches_prevent_core_change` stops every column except `available_quantity` (and `updated_at`) from changing, but it cannot by itself distinguish a legitimate trigger-driven update from a direct application `UPDATE ... SET available_quantity = ...` that bypasses the ledger — both arrive as an ordinary `UPDATE` statement. Production should `REVOKE UPDATE (available_quantity) ON inventory_batches FROM <app_role>` (Postgres supports column-level privileges), so the application role can no longer write that column at all. A plain (`SECURITY INVOKER`, the PL/pgSQL default) function would run as whichever role fired the triggering `INSERT` and would be blocked by that same `REVOKE` — which is why `trg_fn_stock_movements_apply_to_batch` is declared `SECURITY DEFINER`, so it runs with the privileges of the function's owner regardless of who inserted the movement.
- **`barcode`** is a store-issued label unique per tenant (never global, so two tenants cannot collide), and is expected to encode a human-readable variant reference plus a unique batch reference — e.g. `VAR-RED-00001` for a batch of the "Red" variant. **This encoding is presentational only.** The database never parses `barcode` to derive `variant_id` or the batch's own `id` — both are stored as real columns and are what every join, constraint and query actually uses. Scanning a barcode is a lookup by the unique `(tenant_id, barcode)` index, which returns the row; the row's own `variant_id` (and, through it, cost and selling price) is what the application reads next.
- **No `status` column.** The previous `active` / `blocked` / `archived` states are superseded by `available_quantity`: "sold out" is `available_quantity = 0`, and a `DAMAGED`/`LOST` movement already removes damaged or lost stock from `available_quantity` directly, so those units stop being sellable without a separate "blocked" flag. A distinct "held out of sale but not damaged/lost" state (e.g. a recall on stock that is otherwise fine) is not modelled in Phase 1; if that need shows up, it is an additive column, not a redesign.
- **`available_quantity` is not clamped to `received_quantity` — only the floor is enforced.** Nothing prevents `available_quantity` from exceeding `received_quantity` if, say, a `SALE_RETURN` is posted incorrectly; that's a data-entry mistake to catch (e.g. via the reconciliation query above, or an application-level sanity check) and correct with a compensating movement, not a scenario the schema hard-forbids. The floor is different: `CHECK (available_quantity >= 0)` is a hard, transaction-failing constraint (see "Batch balance vs. the ledger"), because going negative means the physical scan/sale that triggered it cannot actually be fulfilled — an asymmetry that matches the real-world asymmetry between "can't sell what isn't there" and "a return was probably just logged against the wrong batch."
- Batches can only be created against a `received` purchase, so history and stock cannot drift.
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
                                'DAMAGED', 'LOST', 'INTERNAL_USE')),
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
        WHEN 'PURCHASED'        THEN  1
        WHEN 'SALE_RETURN'      THEN  1
        WHEN 'SOLD'             THEN -1
        WHEN 'PURCHASE_RETURN'  THEN -1
        WHEN 'DAMAGED'          THEN -1
        WHEN 'LOST'             THEN -1
        WHEN 'INTERNAL_USE'     THEN -1
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
  - **Adds stock:** `PURCHASED`, `SALE_RETURN`
  - **Removes stock:** `SOLD`, `PURCHASE_RETURN`, `DAMAGED`, `LOST`, `INTERNAL_USE`
  - This is deliberately simpler than an application-supplied signed delta: the direction is a property of the *type*, not something each caller can get backwards. A caller only ever writes "10 units, `SOLD`", never "-10 units."
- **No `updated_at`, no updates, no deletes — enforced twice.** The `BEFORE UPDATE OR DELETE` trigger rejects every attempt at the row level; production should also `REVOKE UPDATE, DELETE, TRUNCATE` on this table from the application role, as a second line of defence. A posting mistake is fixed by inserting a new row with the opposite-direction movement type (e.g. a wrongly posted `SOLD` is corrected with a `SALE_RETURN`, or a wrongly posted `DAMAGED` with a manually justified `PURCHASE`-side adjustment through `STOCK_ADJUSTMENT`), never by touching the original row. History is never rewritten, so an audit trail and a stock count always agree with what was actually posted.
- **`reference_type` + `reference_id` trace a movement back to the business transaction that caused it** — a purchase line, a sale line, a return document, or a manual stock adjustment. Phase 1's values: `PURCHASE_ITEM`, `SALE_ITEM`, `PURCHASE_RETURN`, `SALE_RETURN`, `STOCK_ADJUSTMENT`. The pair is polymorphic (it can point at rows in different tables depending on `reference_type`), so — like `membership_store_access`'s cross-table tenant check — it cannot be a real foreign key; the application is responsible for `reference_id` actually existing in the table `reference_type` names, scoped to the same `tenant_id`.
- **`reference_id` is intentionally *not* unique**, globally or per tenant. One business transaction routinely produces several movement rows — a sale with three line items posts three `SOLD` movements against the same `SALE_ITEM` reference (one per batch/variant, since each item may draw from a different batch); a multi-line purchase receipt posts one `PURCHASED` movement per batch, all sharing the same `reference_id` when it identifies the purchase rather than the line. `idx_stock_movements_reference` is a plain (non-unique) index for exactly this "fetch every movement this transaction produced" query.
- **`reference_type`/`reference_id` are both optional together.** Some movements — a shrinkage write-off, a stock take done by feel rather than a formal `STOCK_ADJUSTMENT` record — have no upstream document to point at. `reason` (free text) carries the justification instead. The pair-check constraint only guarantees the two columns move together: never a `reference_type` with no `reference_id` or vice versa.
- **Receipt is part of the foundation, but the ledger itself does not enforce "exactly one."** Every batch must have at least one `PURCHASED` movement equal to its `received_quantity` — enforced by the deferred trigger on `inventory_batches` (which checks `movement_type = 'PURCHASED' AND quantity = received_quantity`), so a batch can never exist without a matching receipt in the ledger. There is deliberately **no uniqueness constraint** tying a batch to a single `PURCHASED` row: that would couple the ledger's shape to the current purchase workflow. Purchase-receipt integrity (a batch is received exactly once today) is a rule of the *purchasing* workflow, enforced there; the ledger's job is only to record what happened, not to police how many times a given business process is allowed to write to it. This also keeps the door open for a batch to legitimately gain more `PURCHASED` rows later (e.g. a correction, or a future batch-split flow) without a schema change.
- **Batch balance vs. the ledger: every insert applies itself, in the same transaction, by construction.** `trg_stock_movements_apply_to_batch` fires `AFTER INSERT` (not deferred) and updates the matching batch's `available_quantity` before the statement completes. Because that update is subject to `inventory_batches`' `CHECK (available_quantity >= 0)`, a movement that would take a batch's balance negative makes the **whole transaction fail** — the `stock_movements` row is never actually committed either. This is a deliberate reversal from the ledger-only design: on-hand is no longer allowed to drift negative as an "estimate" the way a pure `SUM()`-based ledger could. `available_quantity >= 0` is the validation named in the stock-movement integration requirements ("validate sufficient available stock where applicable"), enforced uniformly for every movement type via one `CHECK`, rather than bespoke per-type application logic. The application should still pre-check `available_quantity` before attempting the insert for a good error message — the `CHECK` is the non-negotiable backstop, not the primary UX.
- **`created_by` is required** (`NOT NULL`), unlike most other tables' optional audit columns — every ledger entry must be attributable to the user or system actor that posted it, since a ledger with anonymous entries is not auditable.
- **`occurred_at` (business time) and `created_at` (record time) are both kept, and can diverge.** Inventory movements are financial/operational history, and delayed entry, corrections and future imports are plausible — a cashier fixing yesterday's miscount today should be able to say the event happened yesterday even though the row is inserted now. `occurred_at` defaults to `now()` for the common synchronous case (a sale posts its movement at the moment of sale) but the application may set it explicitly for a backdated or imported entry. `created_at` is never backdated — it is strictly "when this row entered the table," which is what the append-only/audit guarantees above are actually about. Chronological ledger and inventory-query indexes are built on `occurred_at`, since that is the axis a ledger reader cares about; `created_at` remains for audit ordering ("what did we actually insert, and in what order").
- **Phase 1 movement types are the seven above.** No F&B-specific types (e.g. recipe consumption) and no multi-store transfer types yet — both are additive migrations (new `CHECK` values, new `reference_type` values), not redesigns of this table. Batch splitting is similarly additive: it needs a new movement type or two, not a change to the columns here, which is why `quantity`/`movement_type`/`reference_type` are kept as open-ended, migratable `CHECK`-based enums rather than baked into the table shape.
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

### How the main flows map

| Flow | Rows written |
|---|---|
| Create a product | 1 `sellables` (no price) + ≥1 `variants` (each with its own `base_price`, SKU and name) |
| Record a purchase | 1 `purchases` + N `purchase_items` (header totals recomputed in the same transaction) |
| Receive stock | Mark the purchase `received`; per batch, 1 `inventory_batches` (`available_quantity` starts at 0) + 1 `PURCHASED` `stock_movements` row (`reference_type='PURCHASE_ITEM'`), whose trigger brings `available_quantity` up to `received_quantity` — all in one transaction |
| Same variant bought at a new cost | A new purchase line and a new batch with its own barcode. Nothing existing changes |
| Sell stock | 1 `SOLD` `stock_movements` row per batch drawn from (`reference_type='SALE_ITEM'`); its trigger decrements that batch's `available_quantity` in the same transaction, and fails the whole sale if it would go negative |
| Customer returns a sale | 1 `SALE_RETURN` `stock_movements` row (`reference_type='SALE_RETURN'`) |
| Return stock to a supplier | 1 `PURCHASE_RETURN` `stock_movements` row (`reference_type='PURCHASE_RETURN'`) |
| Correct a miscount, damage or loss | 1 `DAMAGED` / `LOST` / `INTERNAL_USE` `stock_movements` row, optionally against a `STOCK_ADJUSTMENT` reference |

### Future path (not Phase 1)

- **Multi-store sharing:** `sellables.store_id` becomes `source_store_id`, plus a `store_sellables` link, `store_variants` for store-level price overrides, and the store checks in the variant guard and in `variants`/`inventory_batches`' composite FKs are relaxed.
- **Transfers:** paired `stock_movements` rows between stores, with new movement types.
- **Batch splitting:** an existing batch's `available_quantity` divided into several new whole-number batches that preserve `variant_id` and `purchase_item_id`; needs a `parent_batch_id`-style lineage column and one or two new `stock_movements` types, not a redesign of `inventory_batches`.
- **Serial-number tracking:** a `stock_units` table beneath batches, without changing batches.
- **Facets and F&B:** optional child tables keyed on sellables and variants (Stocked, Weighed, Made, Configured, Routed, Timed). `kind` stays a coarse discriminator.
- **Price history:** an append-only `variant_price_history` table, without touching `variants`.
- **Also pending:** supplier payables, purchase returns, a `partially_received` purchase status (add to the `CHECK` when needed), and manufacturer barcodes in `variant_barcodes`.

---

## Decisions log

- **Soft delete via a terminal `status` value, no `deleted_at`, everywhere.** `tenants.archived`, `users.deactivated`, `stores.archived`, `tenant_memberships.removed` all follow the same pattern: deletion is a status transition, not a row removal. Retention/compliance handling (§13 N-09/N-10) is a query-time concern (`WHERE status != '...'`), not a physical-deletion concern.
- **Identity/auth (`users`) is fully separated from authorization (`tenant_memberships`).** A user with no memberships is a valid, if useless, row — this is intentional; it keeps account deactivation, password resets, and login independent of any tenant's business logic.
- **Store-level access is additive-restrictive, not additive-grant.** `membership_store_access` narrows a membership that already exists at the tenant level; it cannot grant access to a tenant the user has no membership in. This keeps the "no rows = full access" default safe (fewer rows can never mean more access) and keeps the common single-store case row-free.
- **`tenants.status` no longer has `cancelled`.** It conflated a billing fact (subscription cancelled) with a data-lifecycle fact (tenant archived). Only `trial | active | suspended | archived` remain; subscription state moves to a future `subscriptions` table.
- **The owner invariant is a transactional guarantee, not a convention.** A `trial` or `active` tenant can never reach zero active owners — enforced by a pair of `DEFERRABLE INITIALLY DEFERRED` constraint triggers (on `tenant_memberships` and on `tenants`), checked at transaction commit. This closes the "last owner accidentally removed, tenant becomes inaccessible" failure mode at the database layer rather than relying on application code to remember.
- **Phase 1 catalogue has no sharing.** `sellables.store_id` replaces the earlier tenant-level `sellables` with `source_store_id`, and `store_sellables` is removed. Sharing, `store_variants` and store-level pricing are deferred; the migration path is `store_id` → `source_store_id` plus a link table. This supersedes the earlier "no tenant-level catalogue entity" and "source store is always linked" decisions.
- **Selling price is on the variant.** `variants.base_price` replaces `sellables.base_price`, because variants of one sellable can be priced differently. Purchase cost never lives on `variants`.
- **`tenant_id` on every tenant-owned table, with composite FKs.** Parents expose `UNIQUE (tenant_id, ...)` keys and children reference `(tenant_id, parent_id)` pairs, so the database rejects any cross-tenant reference. `membership_store_access` is the one table that still relies on an application-level same-tenant check.
- **Inventory is append-only, with one trigger-maintained cache.** `inventory_batches.received_quantity` is immutable, and the ledger (`stock_movements`) cannot be updated or deleted. `inventory_batches.available_quantity` is the one exception to "no mutable quantity column": it is a fast operational balance that only the ledger itself, via `trg_stock_movements_apply_to_batch`, is allowed to change — never an application-writable second source of truth. Because that update happens inside the same transaction as the ledger insert and is subject to `CHECK (available_quantity >= 0)`, the two cannot drift apart, and **this supersedes the earlier "negative on-hand is deliberately allowed" decision**: a movement that would oversell a batch now fails the whole transaction instead of being recorded as drift. See `stock_movements`' "Why an append-only ledger" section for the full reasoning.
- **Every Phase 1 quantity column is `INTEGER`: `purchase_items.quantity`, `inventory_batches.received_quantity`/`available_quantity`, and `stock_movements.quantity`.** An earlier draft of this decision kept `purchase_items.quantity` at `NUMERIC(12,3)` to leave room for a future fractional/weighed purchase line, while batch and ledger quantities were already `INTEGER` — that split was itself an unenforced gap (nothing stopped entering a fractional purchase quantity that could then never be fully reconciled into whole-number batches). Superseded: Phase 1 does not support fractional or weighed goods at all, so there is no partial exception to carve out; a future unit-of-measure model is the right place to introduce fractional quantities, not a NUMERIC column sitting unused until then.
- **`inventory_batches` has no `status` column.** The earlier `active`/`blocked`/`archived` states are superseded by `available_quantity` (zero means sold out) and by `DAMAGED`/`LOST` movements already removing bad stock from the operational balance. A distinct "held out of sale but otherwise fine" state is not modelled yet; it would be an additive column, not a redesign.
- **`variants` carries its own `store_id`, denormalised from `sellables` and FK-tied to it.** This lets `inventory_batches` enforce tenant/store/variant consistency with one direct composite FK to `variants`, instead of relying only on the transitive path through `purchase_items`. The same "denormalise the parent's store, then FK back to it" pattern `purchase_items.store_id` already used against `purchases`.
- **Selling price stays variant-first; the sellable is never asked for a price.** No schema change was needed here — `variants.base_price` and a price-less `sellables` were already the Phase 1 design — but the product-creation UX (variant name, SKU, attributes and price entered per-variant) is now an explicit, documented decision rather than an implicit consequence of the schema.
- **Purchase tax and sales tax are, and remain, separate concepts that never share a column.** `purchase_items.tax_amount` is scoped to tax paid to the supplier; a future `sale_items.sales_tax_amount` will be scoped to tax collected from the customer. `inventory_batches` carries only `unit_cost` (acquisition cost for valuation) — no tax field of either kind, absent a demonstrated accounting need.
- **`stock_movements.quantity` is unsigned; direction comes from `movement_type`.** Seven Phase 1 types (`PURCHASED`, `SOLD`, `PURCHASE_RETURN`, `SALE_RETURN`, `DAMAGED`, `LOST`, `INTERNAL_USE`) each map to a fixed sign via `stock_movement_sign()`, rather than trusting each caller to supply a correctly-signed delta. `reference_type`/`reference_id` trace a movement back to its originating transaction and are deliberately not unique, since one transaction (a multi-line sale, a multi-batch receipt) can post several movements against the same reference.
- **`stock_movements` keeps `occurred_at` (business time) separate from `created_at` (record time).** They usually match, but corrections, delayed entry and future imports can legitimately post a movement whose `occurred_at` is in the past. Ledger and inventory-query indexes are built on `occurred_at`.
- **The ledger does not enforce "one `PURCHASED` movement per batch."** Receipt integrity (a batch is received exactly once) is a purchasing-workflow rule, checked by the deferred trigger on `inventory_batches` as an existence check, not a `stock_movements`-level uniqueness constraint — keeping the ledger's own shape independent of how any one business process happens to use it today.
- **A purchase line may be split into several batches.** The rule is that batch `received_quantity` totals may not exceed the line's `quantity`; it is not an equality, so partial receipts and future batch splitting are valid.
- **`kind` is a coarse discriminator only.** `product` / `service` says whether stock can exist. Capabilities (F-01 facets) will be modelled as separate optional tables and are not replaced by `kind`.
- **Purchases and their history are frozen after receipt.** Lines are editable only while a purchase is `draft` or `ordered`; `received` and `cancelled` are terminal. Header totals are verified against the lines at commit.

## Up next

Orders (F-02's state machine) now have something to sell, and their order lines will post `SOLD` `stock_movements` rows against batches, tagged `reference_type='SALE_ITEM'`. Facet tables and store-level pricing follow once the order model is settled.
