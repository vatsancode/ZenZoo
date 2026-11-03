-- Quantities become numeric(12,3) everywhere stock is counted, so a unit that
-- allows decimals (kg, L, ...) can really hold 1.5 - until now every quantity
-- column was an integer, and a 1.5 sent by the app was silently stored as 1
-- (or 2) by the cast. Three places is a gram in a kilo and a millilitre in a
-- litre; whether a particular unit may use them at all is the app's check,
-- against units.allow_decimals.
--
-- Existing whole numbers convert exactly. The CHECK constraints that do maths
-- on quantity already cast it to numeric, so they carry over unchanged; the
-- line totals they check were always rounded to 2 places.

-- A view can't stay attached to a column whose type changes - dropped here and
-- recreated as it was, below.
DROP VIEW public.batch_stock_on_hand;

ALTER TABLE public.inventory_batches
    ALTER COLUMN received_quantity TYPE numeric(12,3),
    ALTER COLUMN available_quantity TYPE numeric(12,3);
ALTER TABLE public.stock_movements ALTER COLUMN quantity TYPE numeric(12,3);
ALTER TABLE public.purchase_items ALTER COLUMN quantity TYPE numeric(12,3);
ALTER TABLE public.purchase_return_items ALTER COLUMN quantity TYPE numeric(12,3);
ALTER TABLE public.sale_items ALTER COLUMN quantity TYPE numeric(12,3);
ALTER TABLE public.sale_item_batches ALTER COLUMN quantity TYPE numeric(12,3);
ALTER TABLE public.sale_return_items ALTER COLUMN quantity TYPE numeric(12,3);

CREATE VIEW public.batch_stock_on_hand WITH (security_invoker='true') AS
 SELECT tenant_id,
    store_id,
    variant_id,
    batch_id,
    sum((quantity * public.stock_movement_sign(movement_type))) AS on_hand
   FROM public.stock_movements
  GROUP BY tenant_id, store_id, variant_id, batch_id;

-- The two guards that held a quantity in an INTEGER variable - a 2.5 there
-- would round to 3 and let an over-allocation through. Bodies otherwise as
-- they were (20261015000000_sales_foundations, 20261013050000_opening_stock_insert_guard).

CREATE OR REPLACE FUNCTION public.trg_fn_sale_item_batches_allocation_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sale_item_id UUID;
    v_quantity     NUMERIC;
    v_allocated    NUMERIC;
BEGIN
    v_sale_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_item_id ELSE NEW.sale_item_id END;

    SELECT quantity INTO v_quantity FROM sale_items WHERE id = v_sale_item_id;

    SELECT COALESCE(SUM(quantity), 0) INTO v_allocated
      FROM sale_item_batches WHERE sale_item_id = v_sale_item_id;

    IF v_allocated > v_quantity THEN
        RAISE EXCEPTION 'sale item % batch allocations (%) exceed its quantity (%)',
            v_sale_item_id, v_allocated, v_quantity;
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_inventory_batches_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
    v_purchase_status VARCHAR(20);
    v_item_quantity   NUMERIC;
    v_received_total  NUMERIC;
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
