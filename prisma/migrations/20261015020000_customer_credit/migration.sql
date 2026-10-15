-- Customer credit at the till: "Pay later" (the customer owes the shop) and "Use store credit"
-- (the shop owes the customer). Both are entries in the one customer_credit_ledger, a running
-- balance per customer: above zero they owe the shop, below zero they hold store credit.
-- Paying a sale with either is a customer-credit payment - a sale_payments row naming no account
-- plus a CREDIT_SALE ledger entry (the sales completion guard already requires the pair).
--
-- 1. The two customer-credit payment methods, for every tenant. The schema allows more than one
--    credit-flagged method on purpose; two keep the sale honest about WHICH it was (store credit
--    spent, or left owing). A new tenant gets them on first use (see ensureCreditMethods).
-- 2. When a customer pays down what they owe, the ledger entry (CREDIT_PAYMENT) has to say which
--    method and account the money came in by, and that money lands in the account - the same way
--    a sale payment does (adjust_account_balance).

INSERT INTO public.payment_methods (tenant_id, name, code, is_customer_credit)
SELECT t.id, v.name, v.code, true
FROM public.tenants t
CROSS JOIN (VALUES
    ('Store credit', 'STORE_CREDIT'),
    ('On account',   'ON_ACCOUNT')
) AS v(name, code)
ON CONFLICT (tenant_id, code) DO NOTHING;

ALTER TABLE public.customer_credit_ledger
    ADD COLUMN payment_method_id  uuid,
    ADD COLUMN payment_account_id uuid;

ALTER TABLE public.customer_credit_ledger
    ADD CONSTRAINT customer_credit_ledger_method_fk
        FOREIGN KEY (tenant_id, payment_method_id)
        REFERENCES public.payment_methods (tenant_id, id),
    ADD CONSTRAINT customer_credit_ledger_account_fk
        FOREIGN KEY (tenant_id, store_id, payment_account_id)
        REFERENCES public.payment_accounts (tenant_id, store_id, id),
    -- A payment received says how and where; nothing else does.
    ADD CONSTRAINT customer_credit_ledger_receipt_pair_check CHECK (
        (entry_type = 'CREDIT_PAYMENT' AND payment_method_id IS NOT NULL AND payment_account_id IS NOT NULL)
        OR (entry_type <> 'CREDIT_PAYMENT' AND payment_method_id IS NULL AND payment_account_id IS NULL)
    );

CREATE FUNCTION public.customer_credit_ledger_apply_receipt() RETURNS trigger
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
        PERFORM public.adjust_account_balance(NEW.payment_account_id, -NEW.amount);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_credit_ledger_apply_receipt
    AFTER INSERT ON public.customer_credit_ledger
    FOR EACH ROW EXECUTE FUNCTION public.customer_credit_ledger_apply_receipt();
