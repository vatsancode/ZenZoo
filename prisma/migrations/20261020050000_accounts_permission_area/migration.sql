-- A new permission area, "accounts": the shop's bank and cash accounts, transfers between them,
-- and the ledger of every money in and out. Until now these sat under "settings", so anyone who
-- could see Settings could see every balance. Each existing role gets the same level on
-- "accounts" as it has on "settings" today, so nobody gains or loses access by this change.

ALTER TABLE public.role_permissions DROP CONSTRAINT role_permissions_area_check;
ALTER TABLE public.role_permissions
    ADD CONSTRAINT role_permissions_area_check CHECK (((area)::text = ANY ((ARRAY[
        'dashboard'::character varying, 'stocks'::character varying, 'catalogue'::character varying,
        'vendors'::character varying, 'purchases'::character varying, 'expenses'::character varying,
        'pos'::character varying, 'sales'::character varying, 'customers'::character varying,
        'settings'::character varying, 'users'::character varying, 'accounts'::character varying
    ])::text[])));

INSERT INTO public.role_permissions (role_id, tenant_id, area, access_level)
SELECT rp.role_id, rp.tenant_id, 'accounts', rp.access_level
FROM public.role_permissions rp
WHERE rp.area = 'settings'
ON CONFLICT (role_id, area) DO NOTHING;

-- New shops: the owner gets "accounts" too. This is the 20261018000000_tenant_owner_user version
-- of the function (owner_user_id set on the tenant) with two changes: "accounts" in the owner's
-- areas, and the starter rows every new shop needs put back - payment methods, units, expense
-- categories and the "Others" category. The 20261016000000_expense_categories version created
-- them; the owner_user_id rewrite dropped them, so a shop signed up since then started empty.
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

    INSERT INTO expense_categories (tenant_id, name, is_catch_all)
    VALUES
        (v_tenant_id, 'Rent', false),
        (v_tenant_id, 'Salaries', false),
        (v_tenant_id, 'Electricity', false),
        (v_tenant_id, 'Transport', false),
        (v_tenant_id, 'Packaging', false),
        (v_tenant_id, 'Marketing', false),
        (v_tenant_id, 'Repairs', false),
        (v_tenant_id, 'Tea and snacks', false),
        (v_tenant_id, 'Other', true);

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
        'expenses', 'pos', 'sales', 'customers', 'settings', 'users', 'accounts'
    ]) AS area;

    INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status)
    VALUES (v_tenant_id, v_user_id, v_owner_role_id, 'active')
    RETURNING id INTO v_membership_id;

    RETURN QUERY SELECT v_user_id, v_tenant_id, v_store_id, v_membership_id;
END;
$$;
