-- Makes sellables.category_id mandatory, backed by a real default category
-- ("Others") every store gets automatically, the same shape as the
-- payment_methods/units seeding before this. Categories are store-scoped
-- (not tenant-wide), so this seeds per store, not per tenant - and since
-- there's no createStore capability yet, provision_new_account() creating
-- the tenant's first (only) store is the one place this needs to happen
-- for new tenants.

-- 1. Back-fill "Others" for every store that already exists.
INSERT INTO categories (tenant_id, store_id, name)
SELECT s.tenant_id, s.id, 'Others'
FROM stores s
ON CONFLICT (tenant_id, store_id, name) WHERE (parent_id IS NULL) DO NOTHING;

-- 2. Move every currently-uncategorized product into its own store's "Others".
UPDATE sellables se
SET category_id = c.id
FROM categories c
WHERE se.category_id IS NULL
  AND c.tenant_id = se.tenant_id
  AND c.store_id = se.store_id
  AND c.parent_id IS NULL
  AND c.name = 'Others';

-- 3. Category is now genuinely required - a product can't be saved without one.
ALTER TABLE public.sellables ALTER COLUMN category_id SET NOT NULL;

-- 4. Make every new store get "Others" automatically, the same moment it's
--    created, so step 1 never has to be repeated by hand later.
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

    INSERT INTO units (tenant_id, code, name, allow_decimals)
    VALUES
        (v_tenant_id, 'pcs', 'Pieces', false),
        (v_tenant_id, 'kg', 'Kilograms', true),
        (v_tenant_id, 'g', 'Grams', true),
        (v_tenant_id, 'L', 'Litres', true),
        (v_tenant_id, 'ml', 'Millilitres', true);

    INSERT INTO stores (tenant_id, name, code)
    VALUES (v_tenant_id, p_store_name, p_store_code)
    RETURNING id INTO v_store_id;

    INSERT INTO categories (tenant_id, store_id, name)
    VALUES (v_tenant_id, v_store_id, 'Others');

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
