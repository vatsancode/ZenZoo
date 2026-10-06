-- Extends provision_new_account to match the decided provisioning flow:
-- no self-serve signup, no forgot-password - the platform admin sets the
-- owner's password directly, and picks the tenant's main store's name/
-- code, all created atomically with the tenant and its owner membership.
-- Parameter list changed, so the old overload is dropped outright rather
-- than replaced in place.
DROP FUNCTION provision_new_account(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR);

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

    -- status is 'trial' here, which is exactly what requires an active owner
    -- - see the tenant_memberships insert below, and "Required provisioning
    -- order" under tenant_memberships in docs/db-design.md
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
