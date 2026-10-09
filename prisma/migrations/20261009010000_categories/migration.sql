-- Product categories, per store (see "categories" in docs/db-design.md).
-- Store-scoped, same as sellables/variants in Phase 1 - each store keeps
-- its own category list, with one level of subcategories.

CREATE TABLE categories (
    id         UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id  UUID NOT NULL REFERENCES tenants (id),
    store_id   UUID NOT NULL,
    parent_id  UUID,
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- target for sellables' and this table's own self-referencing composite FK
    CONSTRAINT categories_tenant_store_id_unique UNIQUE (tenant_id, store_id, id),
    CONSTRAINT categories_store_fk
        FOREIGN KEY (tenant_id, store_id)
        REFERENCES stores (tenant_id, id),
    -- a subcategory's parent must live in the same tenant AND store.
    -- ON DELETE CASCADE: deleting a category removes its subcategories with
    -- it - the application never has to delete them one by one first, and
    -- the admin UI's delete-confirmation copy already says so
    CONSTRAINT categories_parent_fk
        FOREIGN KEY (tenant_id, store_id, parent_id)
        REFERENCES categories (tenant_id, store_id, id)
        ON DELETE CASCADE
);

-- Name uniqueness, split in two because a plain UNIQUE(tenant_id, store_id,
-- parent_id, name) would let two top-level categories share a name - NULLs
-- never collide against each other in a Postgres unique index.
CREATE UNIQUE INDEX idx_categories_top_level_name_unique
    ON categories (tenant_id, store_id, name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX idx_categories_subcategory_name_unique
    ON categories (tenant_id, store_id, parent_id, name) WHERE parent_id IS NOT NULL;

CREATE INDEX idx_categories_store ON categories (tenant_id, store_id);
CREATE INDEX idx_categories_parent ON categories (tenant_id, store_id, parent_id);

CREATE TRIGGER trg_categories_set_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- One level deep only: a subcategory (parent_id set) can never itself be
-- used as a parent. Checked on the CHILD row being inserted/updated (its
-- own parent_id must point at a top-level category), and on the PARENT row
-- being updated (giving a top-level category a parent_id of its own would
-- turn every one of its existing children into a two-level chain).
CREATE FUNCTION trg_fn_categories_one_level_deep() RETURNS TRIGGER AS $$
DECLARE
    v_parent_has_parent BOOLEAN;
    v_has_children       BOOLEAN;
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        SELECT (parent_id IS NOT NULL) INTO v_parent_has_parent
        FROM categories WHERE id = NEW.parent_id;

        IF v_parent_has_parent IS NULL THEN
            RAISE EXCEPTION 'parent category % does not exist', NEW.parent_id;
        END IF;
        IF v_parent_has_parent THEN
            RAISE EXCEPTION 'category % is already a subcategory and cannot have its own subcategories', NEW.parent_id;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
        SELECT EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id) INTO v_has_children;
        IF v_has_children THEN
            RAISE EXCEPTION 'category % has subcategories and cannot become a subcategory itself', NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_categories_one_level_deep
    BEFORE INSERT OR UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_categories_one_level_deep();

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON categories
    USING (tenant_id = app_current_tenant_id())
    WITH CHECK (tenant_id = app_current_tenant_id());

-- A tenant can really delete a category (no archived/active lifecycle here,
-- unlike sellables) - same shape as roles' own grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO app_role;

-- ---------------------------------------------------------------------------
-- sellables: which category a product belongs to. Nullable - every existing
-- sellable today has none, and "uncategorized" stays a valid state going
-- forward too. ON DELETE RESTRICT (the default - no action specified): a
-- category that's still in use on a sellable fails loudly at the database
-- level rather than silently detaching products from it.
-- ---------------------------------------------------------------------------
ALTER TABLE sellables ADD COLUMN category_id UUID;
ALTER TABLE sellables
    ADD CONSTRAINT sellables_category_fk
    FOREIGN KEY (tenant_id, store_id, category_id)
    REFERENCES categories (tenant_id, store_id, id);

CREATE INDEX idx_sellables_category ON sellables (tenant_id, store_id, category_id);
