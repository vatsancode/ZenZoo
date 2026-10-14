-- Adds a real purchase_payments table and reuses account_transfers' own
-- balance-adjusting logic for it, pulled out into one shared function
-- (adjust_account_balance) instead of writing a second copy of "check
-- there's enough money, then move it." Both account_transfers and
-- purchase_payments now call the same function; a future bug fix there
-- fixes both at once. purchase_payments is write-once like
-- account_transfers (SELECT/INSERT only) - a mistaken payment is reversed
-- with a note, not edited or deleted, same reasoning as every other
-- financial ledger row in this schema.

--
-- 1. Pull the actual balance math out of account_transfers_apply_balances
--    into its own function, so purchase_payments can use the exact same
--    logic instead of a copy of it.
--
CREATE FUNCTION public.adjust_account_balance(p_account_id uuid, p_delta numeric) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_balance numeric(14,2);
BEGIN
    SELECT balance INTO v_balance
      FROM payment_accounts
     WHERE id = p_account_id
       FOR UPDATE;

    IF v_balance + p_delta < 0 THEN
        RAISE EXCEPTION 'account % has a balance of % - not enough balance for a change of %',
            p_account_id, v_balance, p_delta;
    END IF;

    UPDATE payment_accounts SET balance = balance + p_delta WHERE id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.account_transfers_apply_balances() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM public.adjust_account_balance(NEW.from_account_id, -NEW.amount);
    PERFORM public.adjust_account_balance(NEW.to_account_id, NEW.amount);
    RETURN NEW;
END;
$$;

--
-- 2. purchase_payments itself.
--
CREATE TABLE public.purchase_payments (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    purchase_id uuid NOT NULL,
    payment_method_id uuid NOT NULL,
    payment_account_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    paid_at date DEFAULT CURRENT_DATE NOT NULL,
    reference character varying(100),
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_payments_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_payments_amount_check CHECK (amount > 0),
    CONSTRAINT purchase_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
    CONSTRAINT purchase_payments_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id),
    CONSTRAINT purchase_payments_purchase_fk FOREIGN KEY (tenant_id, store_id, purchase_id) REFERENCES public.purchases(tenant_id, store_id, id),
    CONSTRAINT purchase_payments_method_fk FOREIGN KEY (tenant_id, payment_method_id) REFERENCES public.payment_methods(tenant_id, id),
    CONSTRAINT purchase_payments_account_fk FOREIGN KEY (tenant_id, store_id, payment_account_id) REFERENCES public.payment_accounts(tenant_id, store_id, id),
    CONSTRAINT purchase_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

CREATE INDEX idx_purchase_payments_purchase ON public.purchase_payments USING btree (tenant_id, purchase_id);

CREATE TRIGGER trg_purchase_payments_set_updated_at BEFORE UPDATE ON public.purchase_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.purchase_payments USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));

REVOKE ALL ON TABLE public.purchase_payments FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.purchase_payments TO app_role;

--
-- 3. Before a payment is actually written: the purchase it's against must
--    be ordered or received (not a draft nobody's committed to yet, not a
--    cancelled one), then its account's balance drops by the amount paid
--    - same single trigger, in that order, so there's no ambiguity about
--    which check runs first the way two separate triggers on the same
--    event would leave to alphabetical luck.
--
CREATE FUNCTION public.purchase_payments_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status character varying(20);
BEGIN
    SELECT status INTO v_status FROM purchases WHERE id = NEW.purchase_id;
    IF v_status NOT IN ('ordered', 'received') THEN
        RAISE EXCEPTION 'a payment can only be recorded against an ordered or received purchase, not %', v_status;
    END IF;

    PERFORM public.adjust_account_balance(NEW.payment_account_id, -NEW.amount);

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_payments_before_insert BEFORE INSERT ON public.purchase_payments FOR EACH ROW EXECUTE FUNCTION public.purchase_payments_before_insert();
