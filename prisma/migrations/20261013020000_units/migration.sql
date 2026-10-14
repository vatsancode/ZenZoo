-- Replaces variants.unit (free text, unvalidated, default 'pcs') with a
-- real units table and a foreign key - same reasoning as payment_methods:
-- a typo'd or differently-cased unit ("Pcs" vs "pcs") used to be
-- indistinguishable from a different unit entirely as far as the database
-- was concerned. Same shape as payment_methods: tenant-level, a reversible
-- active/disabled toggle, never hard-deleted.

CREATE TABLE public.units (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(100) NOT NULL,
    allow_decimals boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT units_pkey PRIMARY KEY (id),
    CONSTRAINT units_code_format_check CHECK ((code)::text ~ '^[A-Za-z0-9]+$'),
    CONSTRAINT units_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'disabled'::character varying])::text[]))),
    CONSTRAINT units_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

CREATE UNIQUE INDEX units_tenant_code_unique ON public.units USING btree (tenant_id, code);
CREATE UNIQUE INDEX units_tenant_id_id_unique ON public.units USING btree (tenant_id, id);

CREATE TRIGGER trg_units_set_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.units USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));

REVOKE ALL ON TABLE public.units FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.units TO app_role;

-- 1. Back-fill the five standard units for every tenant that already exists.
INSERT INTO units (tenant_id, code, name, allow_decimals)
SELECT t.id, v.code, v.name, v.allow_decimals
FROM tenants t
CROSS JOIN (VALUES
    ('pcs', 'Pieces', false),
    ('kg', 'Kilograms', true),
    ('g', 'Grams', true),
    ('L', 'Litres', true),
    ('ml', 'Millilitres', true)
) AS v(code, name, allow_decimals)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 2. Make every new tenant get the same starting set automatically.
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

-- 3. Point every existing variant at its real unit row, matching on the
--    text it already has (case-insensitively - "PCS" and "pcs" both land
--    on the same real row). Anything unrecognized falls back to that
--    tenant's "pcs", rather than being left pointing at nothing.
ALTER TABLE public.variants ADD COLUMN unit_id uuid;

UPDATE public.variants v
SET unit_id = COALESCE(
    (SELECT u.id FROM units u WHERE u.tenant_id = v.tenant_id AND lower(u.code) = lower(v.unit)),
    (SELECT u.id FROM units u WHERE u.tenant_id = v.tenant_id AND u.code = 'pcs')
);

ALTER TABLE public.variants ALTER COLUMN unit_id SET NOT NULL;

ALTER TABLE public.variants
    ADD CONSTRAINT variants_unit_fk FOREIGN KEY (tenant_id, unit_id) REFERENCES public.units(tenant_id, id);

-- 4. The free-text column is now fully replaced - one source of truth,
--    not two that could drift apart.
ALTER TABLE public.variants DROP COLUMN unit;
