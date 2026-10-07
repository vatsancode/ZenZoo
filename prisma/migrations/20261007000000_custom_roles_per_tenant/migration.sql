-- Fully custom roles per tenant, replacing the fixed three-value
-- tenant_memberships.role CHECK constraint. See "roles" / "role_permissions"
-- in docs/db-design.md for the full design and the reasoning behind each
-- guard below; this migration is that design applied as DDL, plus the data
-- migration moving every existing membership off the old `role` column onto
-- the new `role_id` FK.

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id       UUID NOT NULL REFERENCES tenants (id),
    name            VARCHAR(50) NOT NULL,
    is_owner_role   BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT roles_name_unique UNIQUE (tenant_id, name),
    -- target for role_permissions' and tenant_memberships' composite FK
    CONSTRAINT roles_tenant_id_id_unique UNIQUE (tenant_id, id)
);

-- at most one Owner role per tenant - the owner invariant depends on this
-- being unambiguous
CREATE UNIQUE INDEX idx_roles_one_owner_role ON roles (tenant_id) WHERE is_owner_role;

CREATE INDEX idx_roles_tenant_id ON roles (tenant_id);

CREATE TRIGGER trg_roles_set_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON roles
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());

-- the Owner role can never be deleted, renamed, or demoted - the owner
-- invariant (below) relies on it existing and staying identifiable
CREATE FUNCTION trg_fn_roles_protect_owner_role() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_owner_role THEN
            RAISE EXCEPTION 'the Owner role cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.is_owner_role IS DISTINCT FROM NEW.is_owner_role THEN
        RAISE EXCEPTION 'is_owner_role cannot change after a role is created';
    END IF;
    IF OLD.is_owner_role AND OLD.name IS DISTINCT FROM NEW.name THEN
        RAISE EXCEPTION 'the Owner role cannot be renamed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_roles_protect_owner_role
    BEFORE UPDATE OR DELETE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_roles_protect_owner_role();

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------
CREATE TABLE role_permissions (
    role_id       UUID NOT NULL,
    tenant_id     UUID NOT NULL,
    area          VARCHAR(20) NOT NULL
                      CONSTRAINT role_permissions_area_check
                      CHECK (area IN (
                          'dashboard', 'stocks', 'catalogue', 'vendors', 'purchases',
                          'expenses', 'pos', 'sales', 'customers', 'settings', 'users'
                      )),
    access_level  VARCHAR(10) NOT NULL DEFAULT 'none'
                      CONSTRAINT role_permissions_access_level_check
                      CHECK (access_level IN ('none', 'view', 'edit', 'delete')),

    PRIMARY KEY (role_id, area),
    -- ON DELETE CASCADE: a permission row has no meaning independent of its
    -- role, so deleting a (non-Owner - see the guard above) role cleans up
    -- its permission rows in the same statement, rather than requiring the
    -- application to delete all eleven first
    CONSTRAINT role_permissions_role_fk
        FOREIGN KEY (tenant_id, role_id)
        REFERENCES roles (tenant_id, id)
        ON DELETE CASCADE
);

CREATE INDEX idx_role_permissions_tenant_id ON role_permissions (tenant_id);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_permissions
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());

-- the Owner role always has full ('delete') access to every area, and always
-- has all eleven areas present
CREATE FUNCTION trg_fn_role_permissions_protect_owner_role() RETURNS TRIGGER AS $$
DECLARE
    v_is_owner_role BOOLEAN;
BEGIN
    SELECT is_owner_role INTO v_is_owner_role
    FROM roles WHERE id = COALESCE(NEW.role_id, OLD.role_id);

    -- a missing parent row here means ON DELETE CASCADE already removed it as
    -- part of deleting the (necessarily non-Owner - the guard on roles itself
    -- blocks deleting the real Owner role) parent role; NULL must read as
    -- "not the Owner role", not fall through to the opposite via NOT NULL = NULL
    IF COALESCE(v_is_owner_role, false) IS NOT TRUE THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'the Owner role''s permissions cannot be removed';
    END IF;
    IF NEW.access_level <> 'delete' THEN
        RAISE EXCEPTION 'the Owner role always has full access to every area';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_role_permissions_protect_owner_role
    BEFORE INSERT OR UPDATE OR DELETE ON role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_role_permissions_protect_owner_role();

-- Group 2b (see "The application-role privilege model"): a tenant really can
-- delete a custom role or a permission row, so DELETE is granted on both -
-- the Owner role's own protection is the triggers above, not this grant's
-- absence.
GRANT SELECT, INSERT, UPDATE, DELETE ON roles, role_permissions TO app_role;

-- ---------------------------------------------------------------------------
-- tenant_memberships: replace the fixed role CHECK with a real FK to roles
-- ---------------------------------------------------------------------------
ALTER TABLE tenant_memberships ADD COLUMN role_id UUID;

-- Backfill: give every existing tenant its permanent Owner role, plus a
-- starting Manager/Cashier role matching today's two other fixed values -
-- tenants are free to rename or delete the latter two afterward; Owner is
-- permanent (see trg_roles_protect_owner_role).
INSERT INTO roles (tenant_id, name, is_owner_role)
SELECT id, 'Owner', true FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO roles (tenant_id, name, is_owner_role)
SELECT DISTINCT tenant_id, 'Manager', false
FROM tenant_memberships WHERE role = 'manager'
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO roles (tenant_id, name, is_owner_role)
SELECT DISTINCT tenant_id, 'Cashier', false
FROM tenant_memberships WHERE role = 'cashier'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Owner: full access to every area
INSERT INTO role_permissions (role_id, tenant_id, area, access_level)
SELECT r.id, r.tenant_id, area, 'delete'
FROM roles r
CROSS JOIN unnest(ARRAY[
    'dashboard', 'stocks', 'catalogue', 'vendors', 'purchases',
    'expenses', 'pos', 'sales', 'customers', 'settings', 'users'
]) AS area
WHERE r.is_owner_role;

-- Manager: edit everywhere except "users" (view only by default - a tenant
-- can change this afterward through the Settings -> Users role editor)
INSERT INTO role_permissions (role_id, tenant_id, area, access_level)
SELECT r.id, r.tenant_id, area,
    CASE WHEN area = 'users' THEN 'view' ELSE 'edit' END
FROM roles r
CROSS JOIN unnest(ARRAY[
    'dashboard', 'stocks', 'catalogue', 'vendors', 'purchases',
    'expenses', 'pos', 'sales', 'customers', 'settings', 'users'
]) AS area
WHERE r.name = 'Manager' AND NOT r.is_owner_role;

-- Cashier: edit on day-to-day areas, view on lookups, none on the rest
INSERT INTO role_permissions (role_id, tenant_id, area, access_level)
SELECT r.id, r.tenant_id, defaults.area, defaults.lvl
FROM roles r
CROSS JOIN (VALUES
    ('dashboard', 'none'), ('stocks', 'view'), ('catalogue', 'view'),
    ('vendors', 'none'), ('purchases', 'none'), ('expenses', 'none'),
    ('pos', 'edit'), ('sales', 'view'), ('customers', 'edit'),
    ('settings', 'none'), ('users', 'none')
) AS defaults(area, lvl)
WHERE r.name = 'Cashier' AND NOT r.is_owner_role;

-- point every existing membership at its new role row
UPDATE tenant_memberships tm
SET role_id = r.id
FROM roles r
WHERE r.tenant_id = tm.tenant_id
  AND r.name = INITCAP(tm.role);

-- the UPDATE above fires trg_tenant_memberships_owner_guard, which is
-- DEFERRABLE INITIALLY DEFERRED (see "The owner invariant") - its check is
-- still queued, pending, for commit time. Postgres refuses to ALTER TABLE a
-- table with pending trigger events against it in the same transaction, so
-- flush it now, immediately: every membership already has its correct
-- role_id by this point, so the check passes the same as it would at commit.
SET CONSTRAINTS trg_tenant_memberships_owner_guard IMMEDIATE;

ALTER TABLE tenant_memberships ALTER COLUMN role_id SET NOT NULL;

ALTER TABLE tenant_memberships
    ADD CONSTRAINT tenant_memberships_role_fk
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id);

CREATE INDEX idx_tenant_memberships_role_id ON tenant_memberships (role_id);

ALTER TABLE tenant_memberships DROP CONSTRAINT tenant_memberships_role_check;
ALTER TABLE tenant_memberships DROP COLUMN role;

-- ---------------------------------------------------------------------------
-- The owner invariant: role_id -> roles.is_owner_role instead of the old
-- `role = 'owner'` string comparison. Same SECURITY DEFINER shape, same
-- reasoning as before - only the WHERE clause changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_tenant_has_active_owner(p_tenant_id UUID) RETURNS VOID AS $$
DECLARE
    v_tenant_status VARCHAR(20);
    v_owner_count   INT;
BEGIN
    SELECT status INTO v_tenant_status FROM tenants WHERE id = p_tenant_id FOR SHARE;

    IF v_tenant_status NOT IN ('trial', 'active') THEN
        RETURN;
    END IF;

    SELECT count(*) INTO v_owner_count
    FROM tenant_memberships tm
    JOIN roles r ON r.id = tm.role_id
    WHERE tm.tenant_id = p_tenant_id
      AND r.is_owner_role
      AND tm.status = 'active';

    IF v_owner_count = 0 THEN
        RAISE EXCEPTION
            'tenant % is % and must retain at least one active owner membership',
            p_tenant_id, v_tenant_status;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- ---------------------------------------------------------------------------
-- provision_new_account: now also creates the new tenant's permanent Owner
-- role (and its eleven full-access permission rows) before creating the
-- owner membership, since tenant_memberships.role_id is no longer a bare
-- string literal it can hand 'owner' to.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION provision_new_account(
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
    v_owner_role_id UUID;
    v_membership_id UUID;
BEGIN
    INSERT INTO users (email, password_hash, first_name, last_name)
    VALUES (lower(p_email), p_password_hash, p_first_name, p_last_name)
    RETURNING id INTO v_user_id;

    INSERT INTO tenants (name, slug, status)
    VALUES (p_tenant_name, p_tenant_slug, 'trial')
    RETURNING id INTO v_tenant_id;

    INSERT INTO stores (tenant_id, name, code)
    VALUES (v_tenant_id, p_store_name, p_store_code)
    RETURNING id INTO v_store_id;

    INSERT INTO roles (tenant_id, name, is_owner_role)
    VALUES (v_tenant_id, 'Owner', true)
    RETURNING id INTO v_owner_role_id;

    INSERT INTO role_permissions (role_id, tenant_id, area, access_level)
    SELECT v_owner_role_id, v_tenant_id, area, 'delete'
    FROM unnest(ARRAY[
        'dashboard', 'stocks', 'catalogue', 'vendors', 'purchases',
        'expenses', 'pos', 'sales', 'customers', 'settings', 'users'
    ]) AS area;

    INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status)
    VALUES (v_tenant_id, v_user_id, v_owner_role_id, 'active')
    RETURNING id INTO v_membership_id;

    RETURN QUERY SELECT v_user_id, v_tenant_id, v_store_id, v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;
