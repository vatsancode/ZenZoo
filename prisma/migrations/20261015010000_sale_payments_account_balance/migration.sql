-- Money a customer pays at the till lands in the payment account it was paid into, the same
-- way a purchase payment takes money out of one (adjust_account_balance, shared with
-- purchase_payments and account_transfers). Without this a cash sale would never show up in
-- the cash drawer's balance.
--
-- A customer-credit ("on account") payment names no account, so it moves no money here.
-- Refunds and voids reverse this through new rows (adjust_account_balance with a negative
-- delta) when sale returns/voids are built - sale_payments themselves stay write-once.

CREATE FUNCTION public.sale_payments_apply_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.payment_account_id IS NOT NULL THEN
        PERFORM public.adjust_account_balance(NEW.payment_account_id, NEW.amount);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_payments_apply_balance
    AFTER INSERT ON public.sale_payments
    FOR EACH ROW EXECUTE FUNCTION public.sale_payments_apply_balance();
