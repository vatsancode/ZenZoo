-- Category names are unique ignoring case: "Kids wear" and "kids wear" are the same name, whether
-- they are top-level categories (one per shop and store) or subcategories (one per parent).
-- The two old unique indexes only saw exact spelling, so they are replaced, under the same names,
-- by ones on lower(name). Renaming a category to a different capitalisation of its own name
-- still works - the index only compares it with the other rows.

DO $$
DECLARE
    v_clashes text;
BEGIN
    SELECT string_agg(format('%s / store %s%s: %s', tenant_id, store_id,
                             CASE WHEN parent_id IS NULL THEN '' ELSE ' / under ' || parent_id END,
                             names), E'\n')
    INTO v_clashes
    FROM (
        SELECT tenant_id, store_id, parent_id, string_agg(name, ' | ' ORDER BY name) AS names
        FROM categories
        GROUP BY tenant_id, store_id, parent_id, lower(name)
        HAVING count(*) > 1
    ) clashes;

    IF v_clashes IS NOT NULL THEN
        RAISE EXCEPTION E'Rename these categories first - same name ignoring case (tenant / store [/ parent]: names):\n%', v_clashes;
    END IF;
END $$;

DROP INDEX public.idx_categories_top_level_name_unique;
DROP INDEX public.idx_categories_subcategory_name_unique;

CREATE UNIQUE INDEX idx_categories_top_level_name_unique
    ON public.categories USING btree (tenant_id, store_id, lower((name)::text))
    WHERE (parent_id IS NULL);

CREATE UNIQUE INDEX idx_categories_subcategory_name_unique
    ON public.categories USING btree (tenant_id, store_id, parent_id, lower((name)::text))
    WHERE (parent_id IS NOT NULL);
