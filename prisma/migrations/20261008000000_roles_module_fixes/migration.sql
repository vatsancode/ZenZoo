-- Two real gaps found starting the Custom Roles module's actual backend
-- work (listing/creating/editing/deleting a role for real, wired to the
-- admin UI that already shipped this grid):

-- ---------------------------------------------------------------------------
-- 1. roles never got a `description` column, but the admin UI's role editor
--    (Role.description in apps/admin/features/settings/users.ts, written
--    before this schema existed) always had one - add it now rather than
--    drop a field from the UI that's genuinely useful ("Everything,
--    including users and settings." vs. just a bare role name).
-- ---------------------------------------------------------------------------
ALTER TABLE roles ADD COLUMN description VARCHAR(200) NOT NULL DEFAULT '';

UPDATE roles SET description = 'Everything, including users and settings.'
WHERE is_owner_role AND description = '';

-- ---------------------------------------------------------------------------
-- 2. find_login_credentials() (see its own migration,
--    20261006160000_login_credentials_lookup) still selects tm.role - a
--    column 20261007000000_custom_roles_per_tenant dropped. This silently
--    broke every tenant-user sign-in (confirmed: the function now raises
--    "column tm.role does not exist"). The fix also removes the need for a
--    role in the session payload at all: permission resolution now happens
--    per request via hasPermission() against role_id/role_permissions (see
--    server/api/src/auth/actor.ts), re-read fresh from the database on
--    every check - not from a role embedded in a token at login time, which
--    would otherwise go stale for up to the token's 12h lifetime if an
--    owner changed someone's role or permissions mid-session.
-- ---------------------------------------------------------------------------
DROP FUNCTION find_login_credentials(VARCHAR);

CREATE FUNCTION find_login_credentials(p_email VARCHAR(255))
RETURNS TABLE (user_id UUID, password_hash VARCHAR(255), tenant_id UUID)
    SET search_path = pg_catalog, public
    SECURITY DEFINER
    LANGUAGE sql STABLE
AS $$
    SELECT u.id, u.password_hash, tm.tenant_id
      FROM users u
      LEFT JOIN tenant_memberships tm
             ON tm.user_id = u.id AND tm.status = 'active'
     WHERE u.email = p_email
     LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION find_login_credentials(VARCHAR) TO app_role;

-- ---------------------------------------------------------------------------
-- provision_new_account now also sets the Owner role's description, same
-- text used above for existing tenants.
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

    INSERT INTO roles (tenant_id, name, description, is_owner_role)
    VALUES (v_tenant_id, 'Owner', 'Everything, including users and settings.', true)
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
