-- Adds the two movement types "Record movement" needs: a person adding or
-- removing stock by hand (found stock, shrinkage, a manual correction),
-- as opposed to every other movement type so far, which always has a
-- formal source (a purchase, a sale, a return). Same shape as the
-- opening_stock migration before it - widen the type check, teach
-- stock_movement_sign the new types' direction.

ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_type_check;
ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_type_check
    CHECK ((movement_type)::text = ANY (ARRAY[
        'PURCHASED', 'SOLD', 'PURCHASE_RETURN', 'SALE_RETURN', 'DAMAGED',
        'LOST', 'INTERNAL_USE', 'PURCHASE_RETURN_REVERSAL', 'SOLD_REVERSAL',
        'OPENING_STOCK', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'
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
        WHEN 'ADJUSTMENT_IN'            THEN  1
        WHEN 'SOLD'                     THEN -1
        WHEN 'PURCHASE_RETURN'          THEN -1
        WHEN 'DAMAGED'                  THEN -1
        WHEN 'LOST'                     THEN -1
        WHEN 'INTERNAL_USE'             THEN -1
        WHEN 'ADJUSTMENT_OUT'           THEN -1
        ELSE NULL
    END;
END;
$$;
