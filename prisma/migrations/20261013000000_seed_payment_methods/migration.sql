-- payment_methods has existed since the baseline migration but nothing
-- has ever inserted into it - no backend capability reads or writes it,
-- and provision_new_account() never seeded a new tenant's starting set.
-- docs/db-design.md already flagged this as deliberate scope ("seeding
-- default rows... is an application/provisioning concern, not a schema
-- one") - this migration is that provisioning step, finally added.

-- 1. Back-fill the four standard methods for every tenant that already
--    exists. ON CONFLICT DO NOTHING makes this safe to run more than
--    once and harmless for a tenant that somehow already has one of
--    these codes.
INSERT INTO payment_methods (tenant_id, name, code)
SELECT t.id, v.name, v.code
FROM tenants t
CROSS JOIN (VALUES
    ('Cash', 'CASH'),
    ('UPI', 'UPI'),
    ('Card', 'CARD'),
    ('Bank transfer', 'BANK_TRANSFER')
) AS v(name, code)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 2. Make every *new* tenant get the same starting set automatically,
--    as part of the same atomic step that already creates their first
--    store and owner - no separate "don't forget to seed this" step for
--    whoever builds the next thing that needs payment_methods.
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

    INSERT INTO tenants (name, slug, status)
    VALUES (p_tenant_name, p_tenant_slug, 'trial')
    RETURNING id INTO v_tenant_id;

    INSERT INTO payment_methods (tenant_id, name, code)
    VALUES
        (v_tenant_id, 'Cash', 'CASH'),
        (v_tenant_id, 'UPI', 'UPI'),
        (v_tenant_id, 'Card', 'CARD'),
        (v_tenant_id, 'Bank transfer', 'BANK_TRANSFER');

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
