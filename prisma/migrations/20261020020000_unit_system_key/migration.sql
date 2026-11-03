-- A unit's short code is just a label people can edit, so the app must not recognise the
-- built-in "Pieces" unit by its code. system_key marks it instead: 'pieces' for the one unit
-- every shop must keep (made-to-order items use it, and it can't be deleted), NULL for the rest.
ALTER TABLE public.units ADD COLUMN system_key varchar(20);

ALTER TABLE public.units
    ADD CONSTRAINT units_system_key_check CHECK (system_key IS NULL OR system_key IN ('pieces'));

CREATE UNIQUE INDEX units_tenant_system_key_unique
    ON public.units (tenant_id, system_key)
    WHERE system_key IS NOT NULL;

-- Existing shops: their starter "pcs" is the Pieces unit.
UPDATE public.units SET system_key = 'pieces' WHERE code = 'pcs';

-- New shops get their starter units from the sign-up function; this tags its "pcs" without
-- having to rewrite that function. It only ever tags a shop that has no Pieces unit yet, so
-- a "pcs" added later (after the original was renamed) stays an ordinary unit.
CREATE FUNCTION public.units_tag_pieces() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
    IF NEW.system_key IS NULL
       AND NEW.code = 'pcs'
       AND NOT EXISTS (
           SELECT 1 FROM public.units u
           WHERE u.tenant_id = NEW.tenant_id AND u.system_key = 'pieces'
       )
    THEN
        NEW.system_key := 'pieces';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_units_tag_pieces BEFORE INSERT ON public.units
    FOR EACH ROW EXECUTE FUNCTION public.units_tag_pieces();
