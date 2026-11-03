-- A tenant has exactly one owner, and the tenant itself says who it is.
--
-- Until now "the owner" meant "whoever holds the Owner role", which can be
-- several people - so platform_list_tenants() returned one row per owner and
-- the reset-password / correct-email functions picked an arbitrary one.
-- tenants.owner_user_id removes the ambiguity. The "at least one active
-- owner" trigger (trg_tenant_memberships_owner_guard) is untouched and
-- still holds; the application now also refuses to hand the Owner role to
-- anyone else or to disable the owner.

ALTER TABLE tenants ADD COLUMN owner_user_id uuid;

-- Existing tenants: their earliest owner (an active one if there is one).
UPDATE tenants t
SET owner_user_id = (
    SELECT tm.user_id
    FROM tenant_memberships tm
    JOIN roles r ON r.id = tm.role_id AND r.tenant_id = tm.tenant_id
    WHERE tm.tenant_id = t.id
      AND r.is_owner_role
      AND tm.user_id IS NOT NULL
    ORDER BY (tm.status = 'active') DESC, tm.created_at, tm.id
    LIMIT 1
);

-- The UPDATE above queues the deferred owner-guard trigger; Postgres won't
-- ALTER a table with pending trigger events, so run the check now.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE tenants ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE tenants
    ADD CONSTRAINT tenants_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- New accounts: record the first user as the owner in the same insert.
CREATE OR REPLACE FUNCTION public.provision_new_account(p_email character varying, p_password_hash character varying, p_first_name character varying, p_last_name character varying, p_tenant_name character varying, p_tenant_slug character varying, p_store_name character varying, p_store_code character varying) RETURNS TABLE(user_id uuid, tenant_id uuid, store_id uuid, membership_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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

    INSERT INTO tenants (name, slug, status, owner_user_id)
    VALUES (p_tenant_name, p_tenant_slug, 'trial', v_user_id)
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
$$;

-- Tenants list: one row per tenant, owner email straight from the tenant.
CREATE OR REPLACE FUNCTION public.platform_list_tenants(p_search character varying DEFAULT NULL::character varying) RETURNS TABLE(id uuid, name character varying, slug character varying, status character varying, created_at timestamp with time zone, owner_email character varying)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        t.slug,
        t.status,
        t.created_at,
        u.email
    FROM tenants t
    LEFT JOIN users u ON u.id = t.owner_user_id
    WHERE p_search IS NULL
       OR t.name ILIKE '%' || p_search || '%'
       OR t.slug ILIKE '%' || p_search || '%'
    ORDER BY t.created_at DESC;
END;
$$;

-- Reset password / correct email: act on the tenant's recorded owner.
CREATE OR REPLACE FUNCTION public.platform_reset_tenant_owner_password(p_tenant_id uuid, p_password_hash character varying) RETURNS TABLE(user_id uuid, email character varying)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT t.owner_user_id INTO v_user_id FROM tenants t WHERE t.id = p_tenant_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No owner found for tenant %', p_tenant_id;
    END IF;

    UPDATE users
    SET password_hash = p_password_hash
    WHERE id = v_user_id;

    RETURN QUERY SELECT u.id, u.email FROM users u WHERE u.id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_update_tenant_owner_email(p_tenant_id uuid, p_email character varying) RETURNS TABLE(user_id uuid, email character varying)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT t.owner_user_id INTO v_user_id FROM tenants t WHERE t.id = p_tenant_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No owner found for tenant %', p_tenant_id;
    END IF;

    UPDATE users
    SET email = lower(p_email)
    WHERE id = v_user_id;

    RETURN QUERY SELECT u.id, u.email FROM users u WHERE u.id = v_user_id;
END;
$$;
