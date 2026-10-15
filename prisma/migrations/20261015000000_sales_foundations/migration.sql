-- Groundwork for real sales (createSale). Four things:
--
-- 1. Discount intent. sales.discount_amount must equal the sum of the lines' discount_amount
--    (check_sale_totals), so a bill discount has no number of its own - it is spread across
--    the lines. To keep how it was GIVEN ("10% off the bill", "Rs 200 off"), not just the
--    rupees it came to, record the typed discount next to the amounts.
-- 2. Receipt numbers: one counter per (store, prefix), taken inside the sale's own transaction
--    so a rolled-back sale leaves no gap. The admin till uses prefix 'A' (A-000001); the native
--    POS gets its own prefix later, so two tills never issue the same number.
-- 3. sales.source: which till made the sale.
-- 4. Made-to-order items (services, later recipes) are sold without stock, so the completion
--    guard must only demand batch allocation for stocked products.

-- 1. Discount intent ---------------------------------------------------------------------

ALTER TABLE public.sale_items
    ADD COLUMN line_discount_type  character varying(10),
    ADD COLUMN line_discount_value numeric(12,2),
    -- This line's share of the bill discount, already inside discount_amount.
    ADD COLUMN bill_discount_share numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
    ADD CONSTRAINT sale_items_line_discount_pair_check CHECK (
        (line_discount_type IS NULL AND line_discount_value IS NULL)
        OR (line_discount_type = 'amount'  AND line_discount_value > 0)
        OR (line_discount_type = 'percent' AND line_discount_value > 0 AND line_discount_value <= 100)
    ),
    ADD CONSTRAINT sale_items_bill_share_check CHECK (
        bill_discount_share >= 0 AND bill_discount_share <= discount_amount
    );

ALTER TABLE public.sales
    ADD COLUMN bill_discount_type   character varying(10),
    ADD COLUMN bill_discount_value  numeric(12,2),
    -- The bill discount actually taken: the sum of the lines' bill_discount_share.
    ADD COLUMN bill_discount_amount numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN discount_reason      text;

ALTER TABLE public.sales
    ADD CONSTRAINT sales_bill_discount_pair_check CHECK (
        (bill_discount_type IS NULL AND bill_discount_value IS NULL)
        OR (bill_discount_type = 'amount'  AND bill_discount_value > 0)
        OR (bill_discount_type = 'percent' AND bill_discount_value > 0 AND bill_discount_value <= 100)
    ),
    ADD CONSTRAINT sales_bill_discount_amount_check CHECK (
        bill_discount_amount >= 0 AND bill_discount_amount <= discount_amount
    );

-- The header's bill discount must equal what the lines carry, the same way its other
-- totals must (re-runs on every change to either side, via trg_sales_totals_guard).
CREATE OR REPLACE FUNCTION public.check_sale_totals(p_sale_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    s       sales%ROWTYPE;
    v_sub   NUMERIC;
    v_disc  NUMERIC;
    v_share NUMERIC;
    v_tax   NUMERIC;
BEGIN
    SELECT * INTO s FROM sales WHERE id = p_sale_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(round(quantity * unit_price, 2)), 0),
           COALESCE(SUM(discount_amount), 0),
           COALESCE(SUM(bill_discount_share), 0),
           COALESCE(SUM(tax_amount), 0)
      INTO v_sub, v_disc, v_share, v_tax
      FROM sale_items
     WHERE sale_id = p_sale_id;

    IF s.subtotal_amount <> v_sub
       OR s.discount_amount <> v_disc
       OR s.bill_discount_amount <> v_share
       OR s.tax_amount <> v_tax THEN
        RAISE EXCEPTION 'sale % header totals do not match its line items', p_sale_id;
    END IF;
END;
$$;

-- 2. Receipt numbers ----------------------------------------------------------------------

CREATE TABLE public.receipt_counters (
    tenant_id   uuid NOT NULL,
    store_id    uuid NOT NULL,
    prefix      character varying(10) NOT NULL,
    last_number integer DEFAULT 0 NOT NULL,
    CONSTRAINT receipt_counters_pkey PRIMARY KEY (tenant_id, store_id, prefix),
    CONSTRAINT receipt_counters_prefix_check CHECK ((prefix)::text ~ '^[A-Z0-9]+$'),
    CONSTRAINT receipt_counters_last_number_check CHECK (last_number >= 0),
    CONSTRAINT receipt_counters_store_fk FOREIGN KEY (tenant_id, store_id)
        REFERENCES public.stores(tenant_id, id)
);

ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.receipt_counters
    USING ((tenant_id = public.app_current_tenant_id()))
    WITH CHECK ((tenant_id = public.app_current_tenant_id()));

REVOKE ALL ON TABLE public.receipt_counters FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.receipt_counters TO app_role;

-- The next receipt number for a till prefix, e.g. 'A' -> 'A-000001'. The upsert takes a row lock,
-- so two sales at once get different numbers, and it commits or rolls back with the sale.
CREATE FUNCTION public.next_receipt_number(p_tenant_id uuid, p_store_id uuid, p_prefix character varying)
    RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_number INTEGER;
BEGIN
    INSERT INTO receipt_counters AS rc (tenant_id, store_id, prefix, last_number)
    VALUES (p_tenant_id, p_store_id, p_prefix, 1)
    ON CONFLICT (tenant_id, store_id, prefix)
    DO UPDATE SET last_number = rc.last_number + 1
    RETURNING rc.last_number INTO v_number;

    RETURN p_prefix || '-' || lpad(v_number::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_receipt_number(uuid, uuid, character varying) TO app_role;

-- 3. Which till made the sale ------------------------------------------------------------------

ALTER TABLE public.sales
    ADD COLUMN source character varying(10) NOT NULL DEFAULT 'admin';
ALTER TABLE public.sales
    ADD CONSTRAINT sales_source_check CHECK ((source)::text = ANY (ARRAY['admin', 'pos']::text[]));

-- 4. Made-to-order items need no stock ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_sales_completion_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_unallocated INTEGER;
    v_paid        NUMERIC(14,2);
BEGIN
    IF NEW.status = 'completed' AND OLD.status = 'draft' THEN
        IF NOT EXISTS (SELECT 1 FROM sale_items WHERE sale_id = NEW.id) THEN
            RAISE EXCEPTION 'sale % has no items to complete', NEW.id;
        END IF;

        -- every STOCKED item must be fully allocated to batches: sum(allocations) = quantity.
        -- A made-to-order item (a service) has no batches to draw from, so it is exempt.
        SELECT count(*) INTO v_unallocated
          FROM sale_items si
          JOIN variants v   ON v.tenant_id = si.tenant_id AND v.id = si.variant_id
          JOIN sellables sl ON sl.tenant_id = v.tenant_id AND sl.store_id = v.store_id AND sl.id = v.sellable_id
         WHERE si.sale_id = NEW.id
           AND sl.kind = 'product'
           AND si.quantity <> COALESCE(
               (SELECT SUM(sib.quantity) FROM sale_item_batches sib
                 WHERE sib.sale_item_id = si.id), 0);

        IF v_unallocated > 0 THEN
            RAISE EXCEPTION 'sale % has % item(s) not fully allocated to batches', NEW.id, v_unallocated;
        END IF;

        PERFORM check_sale_item_batch_movements(NEW.id, 'SOLD');

        -- payments must sum exactly to the sale total: no unexplained underpayment,
        -- customer credit counts because it is itself a sale_payments row
        SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sale_payments WHERE sale_id = NEW.id;
        IF v_paid <> NEW.total_amount THEN
            RAISE EXCEPTION 'sale % payments (%) do not equal its total (%)',
                NEW.id, v_paid, NEW.total_amount;
        END IF;

        -- every customer-credit payment must have produced a CREDIT_SALE ledger entry
        IF EXISTS (
            SELECT 1 FROM sale_payments sp
              JOIN payment_methods pm ON pm.id = sp.payment_method_id AND pm.tenant_id = sp.tenant_id
             WHERE sp.sale_id = NEW.id AND pm.is_customer_credit
               AND NOT EXISTS (
                   SELECT 1 FROM customer_credit_ledger ccl
                    WHERE ccl.sale_payment_id = sp.id AND ccl.entry_type = 'CREDIT_SALE'
               )
        ) THEN
            RAISE EXCEPTION 'sale % has a customer-credit payment with no matching CREDIT_SALE ledger entry', NEW.id;
        END IF;

    ELSIF NEW.status = 'voided' AND OLD.status = 'completed' THEN
        -- every batch allocation must have a compensating SOLD_REVERSAL movement,
        -- restoring exactly what was sold
        PERFORM check_sale_item_batch_movements(NEW.id, 'SOLD_REVERSAL');

        -- every CREDIT_SALE tied to this sale must have a matching CREDIT_REVERSAL
        IF EXISTS (
            SELECT 1 FROM customer_credit_ledger ccl
             WHERE ccl.sale_id = NEW.id AND ccl.entry_type = 'CREDIT_SALE'
               AND NOT EXISTS (
                   SELECT 1 FROM customer_credit_ledger rev
                    WHERE rev.reverses_entry_id = ccl.id AND rev.entry_type = 'CREDIT_REVERSAL'
               )
        ) THEN
            RAISE EXCEPTION 'sale % has a CREDIT_SALE entry with no matching CREDIT_REVERSAL', NEW.id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;
