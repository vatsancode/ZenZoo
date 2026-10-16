-- Returns and voids on real sales.
--
-- The return tables already put returned stock back batch by batch (a return-origin batch and a
-- SALE_RETURN movement per line), and the sales guard already demands a SOLD_REVERSAL for every
-- allocation and a CREDIT_REVERSAL for every credit sale on a void. What they never had is where
-- the REFUND is recorded - db-design.md calls it a known gap. This adds it:
--
--   refund_mode    money   - paid back out of an account (the balance drops, like any payment out)
--                  credit  - kept as store credit: a CREDIT_ADJUSTMENT in the customer ledger
--                            (negative: the shop owes them). If they owe the shop it simply
--                            takes that off what they owe - one balance, so it nets out.
--                  none    - nothing paid back (a straight swap handled as a new sale)
--
-- A void gives the money back the same way: it reverses what each payment put into an account.
-- sale_payments and the ledger stay write-once; corrections are new rows, never edits.

-- 1. What the returned goods were worth, and how the customer was made whole ----------------

ALTER TABLE public.sale_return_items
    -- This line's share of what the customer paid for the units returned (see returnValue).
    ADD COLUMN value_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sale_return_items
    ADD CONSTRAINT sale_return_items_value_check CHECK (value_amount >= 0);

ALTER TABLE public.sale_returns
    ADD COLUMN note              text,
    ADD COLUMN value_amount      numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN refund_mode       character varying(10) NOT NULL DEFAULT 'none',
    ADD COLUMN refund_amount     numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN refund_method_id  uuid,
    ADD COLUMN refund_account_id uuid;

ALTER TABLE public.sale_returns
    ADD CONSTRAINT sale_returns_refund_mode_check
        CHECK ((refund_mode)::text = ANY (ARRAY['money', 'credit', 'none']::text[])),
    ADD CONSTRAINT sale_returns_value_check CHECK (value_amount >= 0),
    -- Never refund more than the goods were worth; a smaller refund is allowed.
    ADD CONSTRAINT sale_returns_refund_amount_check
        CHECK (refund_amount >= 0 AND refund_amount <= value_amount),
    ADD CONSTRAINT sale_returns_refund_shape_check CHECK (
        (refund_mode = 'none'   AND refund_amount = 0 AND refund_method_id IS NULL AND refund_account_id IS NULL)
        OR (refund_mode = 'credit' AND refund_amount > 0 AND refund_method_id IS NULL AND refund_account_id IS NULL)
        OR (refund_mode = 'money'  AND refund_amount > 0 AND refund_method_id IS NOT NULL AND refund_account_id IS NOT NULL)
    ),
    ADD CONSTRAINT sale_returns_refund_method_fk
        FOREIGN KEY (tenant_id, refund_method_id) REFERENCES public.payment_methods (tenant_id, id),
    ADD CONSTRAINT sale_returns_refund_account_fk
        FOREIGN KEY (tenant_id, store_id, refund_account_id)
        REFERENCES public.payment_accounts (tenant_id, store_id, id);

-- A credit refund is a ledger entry tied to its return, exactly one per return.
ALTER TABLE public.customer_credit_ledger ADD COLUMN sale_return_id uuid;
ALTER TABLE public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_return_fk
        FOREIGN KEY (tenant_id, store_id, sale_return_id)
        REFERENCES public.sale_returns (tenant_id, store_id, id),
    ADD CONSTRAINT customer_credit_ledger_return_type_check
        CHECK (sale_return_id IS NULL OR (entry_type)::text = 'CREDIT_ADJUSTMENT');
CREATE UNIQUE INDEX idx_customer_credit_ledger_return_unique
    ON public.customer_credit_ledger USING btree (sale_return_id)
    WHERE sale_return_id IS NOT NULL;

-- 2. The completion guard also checks the refund ---------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_sale_returns_completion_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sale_status   VARCHAR(20);
    v_sale_customer UUID;
    v_missing_batch INTEGER;
    v_over_returned INTEGER;
    v_items_value   NUMERIC(14,2);
BEGIN
    IF NOT (NEW.status = 'completed' AND OLD.status = 'draft') THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM sale_return_items WHERE sale_return_id = NEW.id) THEN
        RAISE EXCEPTION 'sale_return % has no items to complete', NEW.id;
    END IF;

    -- the sale must STILL be completed - it may have been voided since this return was
    -- drafted, which is exactly the double-restore scenario this guard exists to prevent
    SELECT status, customer_id INTO v_sale_status, v_sale_customer FROM sales WHERE id = NEW.sale_id;
    IF v_sale_status <> 'completed' THEN
        RAISE EXCEPTION 'sale % is % and sale_return % can no longer be completed against it',
            NEW.sale_id, v_sale_status, NEW.id;
    END IF;

    -- lock every original allocation this return draws from BEFORE totalling what has already
    -- been returned, so two concurrent returns can't each pass the ceiling check below
    PERFORM 1
      FROM sale_item_batches
     WHERE id IN (SELECT sale_item_batch_id FROM sale_return_items WHERE sale_return_id = NEW.id)
     ORDER BY id
       FOR UPDATE;

    SELECT count(*) INTO v_over_returned
      FROM (
          SELECT sib.id, sib.quantity AS allowed, SUM(sri2.quantity) AS total_returned
            FROM sale_item_batches sib
            JOIN sale_return_items sri2 ON sri2.sale_item_batch_id = sib.id
            JOIN sale_returns sr2 ON sr2.id = sri2.sale_return_id
           WHERE sr2.status = 'completed' OR sr2.id = NEW.id
           GROUP BY sib.id, sib.quantity
      ) totals
     WHERE totals.total_returned > totals.allowed;

    IF v_over_returned > 0 THEN
        RAISE EXCEPTION 'sale_return % returns more than remains returnable for % batch allocation(s)',
            NEW.id, v_over_returned;
    END IF;

    SELECT count(*) INTO v_missing_batch
      FROM sale_return_items sri
     WHERE sri.sale_return_id = NEW.id
       AND NOT EXISTS (
           SELECT 1 FROM inventory_batches ib
            WHERE ib.sale_return_item_id = sri.id
              AND ib.received_quantity = sri.quantity
              AND EXISTS (
                  SELECT 1 FROM stock_movements sm
                   WHERE sm.batch_id = ib.id
                     AND sm.movement_type = 'SALE_RETURN'
                     AND sm.reference_type = 'SALE_RETURN'
                     AND sm.reference_id = sri.id
                     AND sm.quantity = sri.quantity
              )
       );

    IF v_missing_batch > 0 THEN
        RAISE EXCEPTION 'sale_return % is missing % return batch/movement pair(s)', NEW.id, v_missing_batch;
    END IF;

    -- the return's value is exactly what its lines add up to
    SELECT COALESCE(SUM(value_amount), 0) INTO v_items_value
      FROM sale_return_items WHERE sale_return_id = NEW.id;
    IF v_items_value <> NEW.value_amount THEN
        RAISE EXCEPTION 'sale_return % value (%) does not match its lines (%)',
            NEW.id, NEW.value_amount, v_items_value;
    END IF;

    -- a credit refund needs a known customer and its ledger entry; no other kind has one
    IF NEW.refund_mode = 'credit' THEN
        IF v_sale_customer IS NULL THEN
            RAISE EXCEPTION 'sale_return % cannot be refunded as store credit: the sale has no customer', NEW.id;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM customer_credit_ledger ccl
             WHERE ccl.sale_return_id = NEW.id
               AND ccl.entry_type = 'CREDIT_ADJUSTMENT'
               AND ccl.customer_id = v_sale_customer
               AND ccl.amount = -NEW.refund_amount
        ) THEN
            RAISE EXCEPTION 'sale_return % is a credit refund with no matching ledger entry', NEW.id;
        END IF;
    ELSIF EXISTS (SELECT 1 FROM customer_credit_ledger WHERE sale_return_id = NEW.id) THEN
        RAISE EXCEPTION 'sale_return % has a credit ledger entry but is not a credit refund', NEW.id;
    END IF;

    RETURN NULL;
END;
$$;

-- 3. Money out: a refund leaves its account when the return completes ---------------------------

CREATE FUNCTION public.sale_returns_apply_refund() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_is_credit BOOLEAN;
BEGIN
    IF NEW.refund_mode = 'money' THEN
        SELECT is_customer_credit INTO v_is_credit
          FROM payment_methods WHERE id = NEW.refund_method_id AND tenant_id = NEW.tenant_id;
        IF v_is_credit THEN
            RAISE EXCEPTION 'sale_return % refunds by a customer-credit method, which is not money', NEW.id;
        END IF;
        PERFORM public.adjust_account_balance(NEW.refund_account_id, -NEW.refund_amount);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_returns_apply_refund
    AFTER UPDATE ON public.sale_returns
    FOR EACH ROW
    WHEN (OLD.status = 'draft' AND NEW.status = 'completed')
    EXECUTE FUNCTION public.sale_returns_apply_refund();

-- 4. Voids ------------------------------------------------------------------------------------

-- Cancelling a sale says why.
ALTER TABLE public.sales
    ADD CONSTRAINT sales_void_reason_required_check
    CHECK ((status)::text <> 'voided' OR length(btrim(COALESCE(void_reason, ''))) > 0);

-- A voided sale's payments go back out of the accounts they came into, and the sale's allocations
-- and credit entries are reversed by the app (the sales guard demands exactly that).
CREATE FUNCTION public.sales_apply_void() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_payment RECORD;
BEGIN
    FOR v_payment IN
        SELECT payment_account_id, amount
          FROM sale_payments
         WHERE sale_id = NEW.id AND payment_account_id IS NOT NULL
         ORDER BY id
    LOOP
        PERFORM public.adjust_account_balance(v_payment.payment_account_id, -v_payment.amount);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_apply_void
    AFTER UPDATE ON public.sales
    FOR EACH ROW
    WHEN (OLD.status = 'completed' AND NEW.status = 'voided')
    EXECUTE FUNCTION public.sales_apply_void();
