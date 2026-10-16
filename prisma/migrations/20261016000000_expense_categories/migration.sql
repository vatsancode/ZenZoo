-- Expense categories become real: the headings expenses are filed under
-- (Rent, Salaries...), tenant-level like units and payment methods - a
-- business's headings don't vary by store. Each tenant gets the same
-- starting set, and "Other" is a protected catch-all (is_catch_all) that
-- can't be renamed or deleted. There is no expenses table yet; when one
-- arrives its lines should reference expense_categories (tenant_id, id)
-- with ON DELETE RESTRICT, the way variants reference units.

CREATE TABLE public.expense_categories (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    is_catch_all boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expense_categories_pkey PRIMARY KEY (id),
    CONSTRAINT expense_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

CREATE UNIQUE INDEX expense_categories_tenant_name_unique ON public.expense_categories USING btree (tenant_id, lower((name)::text));
CREATE UNIQUE INDEX expense_categories_tenant_id_id_unique ON public.expense_categories USING btree (tenant_id, id);
CREATE UNIQUE INDEX expense_categories_one_catch_all ON public.expense_categories USING btree (tenant_id) WHERE is_catch_all;

CREATE TRIGGER trg_expense_categories_set_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.expense_categories USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));

REVOKE ALL ON TABLE public.expense_categories FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expense_categories TO app_role;

-- Back-fill the starting set for every existing tenant.
INSERT INTO expense_categories (tenant_id, name, is_catch_all)
SELECT t.id, v.name, v.is_catch_all
FROM tenants t
CROSS JOIN (VALUES
    ('Rent', false),
    ('Salaries', false),
    ('Electricity', false),
    ('Transport', false),
    ('Packaging', false),
    ('Marketing', false),
    ('Repairs', false),
    ('Tea and snacks', false),
    ('Other', true)
) AS v(name, is_catch_all)
ON CONFLICT DO NOTHING;

-- Every new tenant gets the same set automatically.
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
        'expenses', 'pos', 'sales', 'customers', 'settings', 'users'
    ]) AS area;

    INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status)
    VALUES (v_tenant_id, v_user_id, v_owner_role_id, 'active')
    RETURNING id INTO v_membership_id;

    RETURN QUERY SELECT v_user_id, v_tenant_id, v_store_id, v_membership_id;
END;
$$;
