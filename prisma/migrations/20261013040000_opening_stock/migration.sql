-- Adds "opening stock" as a third legitimate reason an inventory batch can
-- exist, alongside purchase-origin and return-origin - no new table, since
-- every field this needs (variant, quantity, cost, when, who) already
-- lives on inventory_batches/stock_movements, the same as every other
-- kind of stock entry. stock_movements_reference_pair_check already
-- allows reference_type/reference_id to both be null, so an opening-stock
-- movement simply has no reference, exactly like the schema already
-- permits for an entry with nothing to point to.

-- 1. Was "exactly one of purchase_item_id / sale_return_item_id must be
--    set" (a strict XOR) - now "not both at once", which quietly makes a
--    third state legal: neither set, meaning this batch is an opening
--    balance, not bought and not returned.
ALTER TABLE public.inventory_batches DROP CONSTRAINT inventory_batches_origin_check;
ALTER TABLE public.inventory_batches
    ADD CONSTRAINT inventory_batches_origin_check
    CHECK (NOT (purchase_item_id IS NOT NULL AND sale_return_item_id IS NOT NULL));

-- 2. A new, honestly-labeled reason stock can move - stock coming in
--    because it's a starting balance, not because it was purchased.
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_type_check;
ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_type_check
    CHECK ((movement_type)::text = ANY (ARRAY[
        'PURCHASED', 'SOLD', 'PURCHASE_RETURN', 'SALE_RETURN', 'DAMAGED',
        'LOST', 'INTERNAL_USE', 'PURCHASE_RETURN_REVERSAL', 'SOLD_REVERSAL',
        'OPENING_STOCK'
    ]::text[]));

CREATE OR REPLACE FUNCTION public.stock_movement_sign(p_movement_type character varying) RETURNS smallint
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    RETURN CASE p_movement_type
        WHEN 'PURCHASED'                THEN  1
        WHEN 'SALE_RETURN'              THEN  1
        WHEN 'PURCHASE_RETURN_REVERSAL' THEN  1
        WHEN 'SOLD_REVERSAL'            THEN  1
        WHEN 'OPENING_STOCK'            THEN  1
        WHEN 'SOLD'                     THEN -1
        WHEN 'PURCHASE_RETURN'          THEN -1
        WHEN 'DAMAGED'                  THEN -1
        WHEN 'LOST'                     THEN -1
        WHEN 'INTERNAL_USE'             THEN -1
        ELSE NULL
    END;
END;
$$;
