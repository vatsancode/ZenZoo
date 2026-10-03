-- Baseline migration for the ZenZoo schema.
--
-- This file is extracted, verbatim, from the SQL in docs/db-design.md (the
-- actual source of truth for this schema) - every CREATE TABLE, FUNCTION,
-- TRIGGER, INDEX, VIEW and the RLS/privilege-model statements. Nothing here
-- was redesigned or reinterpreted for this monorepo setup.
--
-- One real change was necessary: db-design.md presents "Row-level security"
-- (roles, ENABLE ROW LEVEL SECURITY, CREATE POLICY, the provision_new_account
-- bootstrap function) as an early, cross-cutting narrative section, placed
-- before most of the tables it actually references. Run literally in that
-- order, it fails - CREATE POLICY/ALTER TABLE statements for a table need
-- that table to already exist. This file reorders ONLY that block to the
-- end, after every CREATE TABLE - no statement's content was changed, only
-- its position. This was discovered and fixed by actually applying this
-- file to a real PostgreSQL 16 instance while setting up this repository;
-- it applied cleanly end to end afterward.
--
-- Prerequisite: `uuidv7()` must already exist in the target database.
-- docs/db-design.md's own note on `tenants.id` names two real options for
-- Postgres < 18 (the `pg_uuidv7` extension, or generating it in the
-- application layer); see prisma/README.md for a plpgsql shim usable for
-- *local development only* if neither is available yet - do not run that
-- shim against a real deployment target.

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

-- the exact two expressions every policy below is built from

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

ALTER TABLE inventory_batches
    ADD CONSTRAINT inventory_batches_sale_return_item_fk
    FOREIGN KEY (tenant_id, store_id, sale_return_item_id, variant_id)
    REFERENCES sale_return_items (tenant_id, store_id, id, variant_id);

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

-- ===== RLS, privilege model, and signup bootstrap (moved here: these ALTER/GRANT/
-- CREATE POLICY statements reference tables defined throughout the document and
-- must run after every CREATE TABLE, even though db-design.md presents this as an
-- early, cross-cutting section for narrative reasons) =====

CREATE FUNCTION app_current_tenant_id() RETURNS UUID AS $$
    SELECT current_setting('app.current_tenant_id', true)::UUID;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION app_current_user_id() RETURNS UUID AS $$
    SELECT current_setting('app.current_user_id', true)::UUID;
$$ LANGUAGE sql STABLE;

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

-- the ONE deliberate, narrow exception to "app_role never bypasses RLS." Runs as
-- app_owner (its definer), which — as the owner of users/tenants/tenant_memberships —
-- is exempt from RLS on them, for exactly the three inserts below and nothing else.
-- It is not a general-purpose escape hatch: it takes no caller-supplied tenant_id or
-- user_id to attach new rows to an EXISTING tenant, it only ever creates a brand-new
-- user, a brand-new tenant, and the one membership tying them together — and it hands
-- back only the three ids it just created. There is no code path through this function
-- that can read or write a tenant that already exists.
CREATE FUNCTION provision_new_account(
    p_email       VARCHAR(255),
    p_first_name  VARCHAR(100),
    p_last_name   VARCHAR(100),
    p_tenant_name VARCHAR(200),
    p_tenant_slug VARCHAR(100)
) RETURNS TABLE (user_id UUID, tenant_id UUID, membership_id UUID) AS $$
DECLARE
    v_user_id       UUID;
    v_tenant_id     UUID;
    v_membership_id UUID;
BEGIN
    INSERT INTO users (email, first_name, last_name)
    VALUES (lower(p_email), p_first_name, p_last_name)
    RETURNING id INTO v_user_id;

    -- status is 'trial' here, which is exactly what requires an active owner — see the
    -- next insert, and "Required provisioning order" under tenant_memberships
    INSERT INTO tenants (name, slug, status)
    VALUES (p_tenant_name, p_tenant_slug, 'trial')
    RETURNING id INTO v_tenant_id;

    INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
    VALUES (v_tenant_id, v_user_id, 'owner', 'active')
    RETURNING id INTO v_membership_id;

    RETURN QUERY SELECT v_user_id, v_tenant_id, v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION provision_new_account(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_new_account(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO app_role;
