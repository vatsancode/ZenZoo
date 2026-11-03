-- The account ledger: every money in and out of a payment account, one row per movement, never
-- edited or deleted. A mistake is put right by a new row (an expense edit records the old amount
-- coming back and the new one going out), the same rule account_transfers and the payment tables
-- already follow.
--
-- Every movement already goes through one function, adjust_account_balance(), which checks the
-- account can afford it and moves the balance. The ledger row is written there, in the same step,
-- so the ledger and the balance can never disagree. The callers now say what kind of movement it
-- is and which row caused it.
--
-- The ledger starts today: each account gets one "starting balance" row equal to its balance
-- now. Older movements stay in their own tables (sales, purchases, transfers...) as before.
--
-- Also: an account's opening balance locks once any real money has moved in or out of it, so
-- it can't be rewritten after the fact. Before that it can still be corrected, as a ledger row.

-- 1. The opening-balance lock ---------------------------------------------------------------------

ALTER TABLE public.payment_accounts ADD COLUMN opening_locked boolean DEFAULT false NOT NULL;

-- Accounts that have already had money move: anything in a table that moves an account's money,
-- or a balance that has drifted from the opening balance (which also catches deleted expenses).
UPDATE public.payment_accounts a
   SET opening_locked = true
 WHERE a.balance <> a.opening_balance
    OR EXISTS (SELECT 1 FROM public.account_transfers t WHERE t.from_account_id = a.id OR t.to_account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.purchase_payments p WHERE p.payment_account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.sale_payments s WHERE s.payment_account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.customer_credit_ledger c WHERE c.payment_account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.sale_returns r WHERE r.refund_account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.payment_account_id = a.id);

-- 2. The ledger table -----------------------------------------------------------------------------

CREATE TABLE public.account_ledger (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    account_id uuid NOT NULL,
    -- What moved the money. source_id is that row (a sale payment, a transfer, an expense ...);
    -- there is no foreign key on it, so the ledger keeps its row even if an expense is deleted.
    kind character varying(30) NOT NULL,
    source_id uuid,
    -- Money in is positive, money out negative. balance_after is the account's balance the
    -- moment this row was written.
    amount numeric(14,2) NOT NULL,
    balance_after numeric(14,2) NOT NULL,
    created_by uuid DEFAULT NULLIF(current_setting('app.current_user_id', true), '')::uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_ledger_pkey PRIMARY KEY (id),
    CONSTRAINT account_ledger_amount_check CHECK (amount <> 0),
    CONSTRAINT account_ledger_kind_check CHECK ((kind)::text = ANY ((ARRAY[
        'starting_balance', 'opening_balance', 'opening_correction',
        'sale_payment', 'sale_void', 'sale_refund', 'customer_payment',
        'purchase_payment', 'expense_payment', 'expense_reversal',
        'transfer_in', 'transfer_out', 'other'
    ])::text[])),
    CONSTRAINT account_ledger_account_fk FOREIGN KEY (tenant_id, store_id, account_id)
        REFERENCES public.payment_accounts (tenant_id, store_id, id),
    CONSTRAINT account_ledger_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
);

CREATE INDEX idx_account_ledger_store_created
    ON public.account_ledger (tenant_id, store_id, created_at DESC, id DESC);
CREATE INDEX idx_account_ledger_account_created
    ON public.account_ledger (tenant_id, account_id, created_at DESC, id DESC);

ALTER TABLE public.account_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.account_ledger
    USING ((tenant_id = public.app_current_tenant_id()))
    WITH CHECK ((tenant_id = public.app_current_tenant_id()));

-- Read and add only. The trigger below also stops the table owner from changing a row.
REVOKE ALL ON TABLE public.account_ledger FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.account_ledger TO app_role;

CREATE FUNCTION public.account_ledger_is_permanent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'account_ledger rows are permanent - record a new entry to correct one';
END;
$$;

CREATE TRIGGER trg_account_ledger_is_permanent
    BEFORE UPDATE OR DELETE ON public.account_ledger
    FOR EACH ROW EXECUTE FUNCTION public.account_ledger_is_permanent();

-- 3. Starting balances: the ledger begins at today's balance ---------------------------------------

INSERT INTO public.account_ledger (tenant_id, store_id, account_id, kind, amount, balance_after)
SELECT tenant_id, store_id, id, 'starting_balance', balance, balance
  FROM public.payment_accounts
 WHERE balance <> 0;

-- 4. One place moves money and writes the ledger ----------------------------------------------------

CREATE FUNCTION public.adjust_account_balance(
    p_account_id uuid,
    p_delta numeric,
    p_kind character varying,
    p_source_id uuid
) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_balance   numeric(14,2);
    v_tenant_id uuid;
    v_store_id  uuid;
    v_locked    boolean;
BEGIN
    SELECT balance, tenant_id, store_id, opening_locked
      INTO v_balance, v_tenant_id, v_store_id, v_locked
      FROM payment_accounts
     WHERE id = p_account_id
       FOR UPDATE;

    IF p_kind = 'opening_correction' AND v_locked THEN
        RAISE EXCEPTION 'account % already has money in or out - its opening balance is locked', p_account_id;
    END IF;

    IF v_balance + p_delta < 0 THEN
        RAISE EXCEPTION 'account % has a balance of % - not enough balance for a change of %',
            p_account_id, v_balance, p_delta;
    END IF;

    UPDATE payment_accounts
       SET balance = balance + p_delta,
           opening_locked = opening_locked
               OR p_kind NOT IN ('starting_balance', 'opening_balance', 'opening_correction')
     WHERE id = p_account_id;

    IF p_delta <> 0 THEN
        INSERT INTO account_ledger (tenant_id, store_id, account_id, kind, source_id, amount, balance_after)
        VALUES (v_tenant_id, v_store_id, p_account_id, p_kind, p_source_id, p_delta, v_balance + p_delta);
    END IF;
END;
$$;

-- The two-argument form stays for anything that still calls it: it moves the money the same way
-- and lands in the ledger as "other", so no movement can skip the ledger.
CREATE OR REPLACE FUNCTION public.adjust_account_balance(p_account_id uuid, p_delta numeric) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM public.adjust_account_balance(p_account_id, p_delta, 'other', NULL);
END;
$$;

-- A new account's opening balance is its first ledger row.
CREATE FUNCTION public.payment_accounts_record_opening() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.balance <> 0 THEN
        INSERT INTO account_ledger (tenant_id, store_id, account_id, kind, amount, balance_after)
        VALUES (NEW.tenant_id, NEW.store_id, NEW.id, 'opening_balance', NEW.balance, NEW.balance);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_payment_accounts_record_opening
    AFTER INSERT ON public.payment_accounts
    FOR EACH ROW EXECUTE FUNCTION public.payment_accounts_record_opening();

-- 5. Every caller says what moved the money ---------------------------------------------------------
-- Each function below is its latest version unchanged, except the adjust_account_balance() call.

-- from 20261013010000_purchase_payments
CREATE OR REPLACE FUNCTION public.account_transfers_apply_balances() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM public.adjust_account_balance(NEW.from_account_id, -NEW.amount, 'transfer_out', NEW.id);
    PERFORM public.adjust_account_balance(NEW.to_account_id, NEW.amount, 'transfer_in', NEW.id);
    RETURN NEW;
END;
$$;

-- from 20261013010000_purchase_payments
CREATE OR REPLACE FUNCTION public.purchase_payments_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_status character varying(20);
BEGIN
    SELECT status INTO v_status FROM purchases WHERE id = NEW.purchase_id;
    IF v_status NOT IN ('ordered', 'received') THEN
        RAISE EXCEPTION 'a payment can only be recorded against an ordered or received purchase, not %', v_status;
    END IF;

    PERFORM public.adjust_account_balance(NEW.payment_account_id, -NEW.amount, 'purchase_payment', NEW.id);

    RETURN NEW;
END;
$$;

-- from 20261015010000_sale_payments_account_balance
CREATE OR REPLACE FUNCTION public.sale_payments_apply_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.payment_account_id IS NOT NULL THEN
        PERFORM public.adjust_account_balance(NEW.payment_account_id, NEW.amount, 'sale_payment', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

-- from 20261015020000_customer_credit
CREATE OR REPLACE FUNCTION public.customer_credit_ledger_apply_receipt() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_is_credit BOOLEAN;
BEGIN
    IF NEW.entry_type = 'CREDIT_PAYMENT' THEN
        SELECT is_customer_credit INTO v_is_credit
          FROM payment_methods
         WHERE id = NEW.payment_method_id AND tenant_id = NEW.tenant_id;
        IF v_is_credit THEN
            RAISE EXCEPTION 'customer_credit_ledger % was received by a customer-credit method, which is not money', NEW.id;
        END IF;
        -- amount is negative for a payment; the account gains its size.
        PERFORM public.adjust_account_balance(NEW.payment_account_id, -NEW.amount, 'customer_payment', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

-- from 20261015030000_sale_returns_and_voids
CREATE OR REPLACE FUNCTION public.sale_returns_apply_refund() RETURNS trigger
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
        PERFORM public.adjust_account_balance(NEW.refund_account_id, -NEW.refund_amount, 'sale_refund', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

-- from 20261015030000_sale_returns_and_voids
CREATE OR REPLACE FUNCTION public.sales_apply_void() RETURNS trigger
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
        PERFORM public.adjust_account_balance(v_payment.payment_account_id, -v_payment.amount, 'sale_void', NEW.id);
    END LOOP;
    RETURN NEW;
END;
$$;

-- from 20261016010000_expenses - plus one change: an edit that leaves a paid bill's amount and
-- account as they were (a new note, say) moves no money, instead of taking it back and paying
-- it again. The balance comes out the same either way; this keeps two empty rows out of the ledger.
CREATE OR REPLACE FUNCTION public.expenses_apply_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'paid' AND NEW.status = 'paid'
       AND OLD.payment_account_id = NEW.payment_account_id
       AND OLD.total = NEW.total THEN
        RETURN NULL;
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'paid' THEN
        PERFORM public.adjust_account_balance(OLD.payment_account_id, OLD.total, 'expense_reversal', OLD.id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'paid' THEN
        PERFORM public.adjust_account_balance(NEW.payment_account_id, -NEW.total, 'expense_payment', NEW.id);
    END IF;
    RETURN NULL;
END;
$$;
