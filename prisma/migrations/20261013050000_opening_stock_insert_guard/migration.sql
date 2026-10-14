-- The previous migration (20261013040000_opening_stock) widened
-- inventory_batches_origin_check so a batch can legally have neither a
-- purchase nor a return behind it - but missed a second guard that also
-- assumed those were the only two possibilities:
-- trg_fn_inventory_batches_insert_guard's ELSE branch treated "not
-- purchase-origin" as "must be return-origin" and demanded a matching
-- SALE_RETURN movement, which an opening-stock batch (sale_return_item_id
-- also NULL) can never have - hence "batch % has no matching SALE_RETURN
-- stock movement" on a perfectly legal opening-stock insert. Splits that
-- ELSE into its own ELSIF, with opening stock as the real third case,
-- checked the same way the other two already are: a matching movement row
-- must exist, just OPENING_STOCK instead of PURCHASED or SALE_RETURN.

CREATE OR REPLACE FUNCTION public.trg_fn_inventory_batches_insert_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_purchase_status VARCHAR(20);
    v_item_quantity   INTEGER;
    -- SUM() over an integer column returns bigint
    v_received_total  BIGINT;
    v_return_status   VARCHAR(20);
BEGIN
    IF NEW.purchase_item_id IS NOT NULL THEN
        SELECT p.status, pi.quantity
          INTO v_purchase_status, v_item_quantity
          FROM purchase_items pi
          JOIN purchases p ON p.id = pi.purchase_id AND p.tenant_id = pi.tenant_id
         WHERE pi.id = NEW.purchase_item_id;

        IF v_purchase_status <> 'received' THEN
            RAISE EXCEPTION 'batch % needs a received purchase (purchase is %)', NEW.id, v_purchase_status;
        END IF;

        -- one line may be split into several batches, but together they cannot exceed the line
        SELECT COALESCE(SUM(received_quantity), 0) INTO v_received_total
          FROM inventory_batches
         WHERE purchase_item_id = NEW.purchase_item_id;

        IF v_received_total > v_item_quantity THEN
            RAISE EXCEPTION 'batches for purchase item % total %, more than the purchased %',
                NEW.purchase_item_id, v_received_total, v_item_quantity;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM stock_movements
             WHERE batch_id = NEW.id
               AND movement_type = 'PURCHASED'
               AND quantity = NEW.received_quantity
        ) THEN
            RAISE EXCEPTION 'batch % has no matching PURCHASED stock movement', NEW.id;
        END IF;
    ELSIF NEW.sale_return_item_id IS NOT NULL THEN
        SELECT sr.status INTO v_return_status
          FROM sale_return_items sri
          JOIN sale_returns sr ON sr.id = sri.sale_return_id AND sr.tenant_id = sri.tenant_id
         WHERE sri.id = NEW.sale_return_item_id;

        IF v_return_status <> 'completed' THEN
            RAISE EXCEPTION 'batch % needs a completed sale return (return is %)', NEW.id, v_return_status;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM stock_movements
             WHERE batch_id = NEW.id
               AND movement_type = 'SALE_RETURN'
               AND quantity = NEW.received_quantity
        ) THEN
            RAISE EXCEPTION 'batch % has no matching SALE_RETURN stock movement', NEW.id;
        END IF;
    ELSE
        -- Neither a purchase nor a return - this is an opening-stock batch
        -- (legal since inventory_batches_origin_check was widened). Same
        -- shape of check as the other two: a matching movement must exist.
        IF NOT EXISTS (
            SELECT 1 FROM stock_movements
             WHERE batch_id = NEW.id
               AND movement_type = 'OPENING_STOCK'
               AND quantity = NEW.received_quantity
        ) THEN
            RAISE EXCEPTION 'batch % has no matching OPENING_STOCK stock movement', NEW.id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;
