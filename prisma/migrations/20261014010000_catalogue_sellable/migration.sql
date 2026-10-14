-- The catalogue is not a copy of inventory - it's the subset of sellables
-- the till may sell. Two kinds of sellable:
--   product       - stock you buy and count. Only in the catalogue once
--                   someone marks it sellable (by hand, or by auto-import).
--   made_to_order - never counted as stock itself (a service like blouse
--                   stitching today, a cafe recipe later). Always sellable.
-- Renames the old 'service' kind to 'made_to_order', adds the is_sellable
-- flag, and the per-store "keep importing new inventory" switch.

-- kind is immutable by trigger, so the rename has to step around it once.
ALTER TABLE public.sellables DISABLE TRIGGER trg_sellables_prevent_identity_change;
ALTER TABLE public.sellables DROP CONSTRAINT sellables_kind_check;
UPDATE public.sellables SET kind = 'made_to_order' WHERE kind = 'service';
ALTER TABLE public.sellables ENABLE TRIGGER trg_sellables_prevent_identity_change;
ALTER TABLE public.sellables
    ADD CONSTRAINT sellables_kind_check
    CHECK ((kind)::text = ANY (ARRAY['product', 'made_to_order']::text[]));

ALTER TABLE public.sellables ADD COLUMN is_sellable boolean NOT NULL DEFAULT false;
UPDATE public.sellables SET is_sellable = true WHERE kind = 'made_to_order';
ALTER TABLE public.sellables
    ADD CONSTRAINT sellables_made_to_order_sellable_check
    CHECK ((kind)::text <> 'made_to_order' OR is_sellable);

-- The catalogue list and the import popup both filter on this per store.
CREATE INDEX idx_sellables_store_sellable
    ON public.sellables USING btree (tenant_id, store_id, is_sellable);

ALTER TABLE public.stores ADD COLUMN catalogue_auto_import boolean NOT NULL DEFAULT false;
