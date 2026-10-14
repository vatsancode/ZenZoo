-- Adds a real opening/running balance to payment_accounts and a new
-- account_transfers table for moving money between a tenant's own
-- accounts. The running balance is maintained by a trigger the instant a
-- transfer is inserted - never recalculated from history on read - the
-- same shape inventory_batches.available_quantity already uses via
-- trg_stock_movements_apply_to_batch. account_transfers itself is
-- write-once like stock_movements (SELECT/INSERT only, no UPDATE/DELETE
-- grant): a mistaken transfer is reversed with a new opposite transfer,
-- never edited or deleted, same as any other financial ledger row in this
-- schema.

ALTER TABLE public.payment_accounts
    ADD COLUMN opening_balance numeric(14,2) DEFAULT 0 NOT NULL,
    ADD COLUMN balance numeric(14,2) DEFAULT 0 NOT NULL;

CREATE TABLE public.account_transfers (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    from_account_id uuid NOT NULL,
    to_account_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    transfer_date date DEFAULT CURRENT_DATE NOT NULL,
    note character varying(500),
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_transfers_pkey PRIMARY KEY (id),
    CONSTRAINT account_transfers_amount_check CHECK (amount > 0),
    CONSTRAINT account_transfers_distinct_accounts_check CHECK (from_account_id <> to_account_id),
    CONSTRAINT account_transfers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
    CONSTRAINT account_transfers_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id),
    CONSTRAINT account_transfers_from_account_fk FOREIGN KEY (tenant_id, store_id, from_account_id) REFERENCES public.payment_accounts(tenant_id, store_id, id),
    CONSTRAINT account_transfers_to_account_fk FOREIGN KEY (tenant_id, store_id, to_account_id) REFERENCES public.payment_accounts(tenant_id, store_id, id),
    CONSTRAINT account_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

CREATE INDEX idx_account_transfers_from_account ON public.account_transfers USING btree (tenant_id, from_account_id);
CREATE INDEX idx_account_transfers_to_account ON public.account_transfers USING btree (tenant_id, to_account_id);

CREATE TRIGGER trg_account_transfers_set_updated_at BEFORE UPDATE ON public.account_transfers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.account_transfers USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));

REVOKE ALL ON TABLE public.account_transfers FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.account_transfers TO app_role;

--
-- Keeps payment_accounts.balance correct the instant a transfer is written
-- - a BEFORE INSERT trigger, not AFTER, so a transfer that would overdraw
-- an account is rejected and the transfer row itself never gets created.
-- The FOR UPDATE lock on the source account's row is what makes this safe
-- under concurrent transfers out of the same account - without it, two
-- simultaneous transfers could each read the same starting balance and
-- both pass the check even though, together, they overdraw it.
--
CREATE FUNCTION public.account_transfers_apply_balances() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_from_balance numeric(14,2);
BEGIN
    SELECT balance INTO v_from_balance
      FROM payment_accounts
     WHERE id = NEW.from_account_id
       FOR UPDATE;

    IF v_from_balance < NEW.amount THEN
        RAISE EXCEPTION 'account % has a balance of % - not enough to transfer %',
            NEW.from_account_id, v_from_balance, NEW.amount;
    END IF;

    UPDATE payment_accounts SET balance = balance - NEW.amount WHERE id = NEW.from_account_id;
    UPDATE payment_accounts SET balance = balance + NEW.amount WHERE id = NEW.to_account_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_account_transfers_apply_balances BEFORE INSERT ON public.account_transfers FOR EACH ROW EXECUTE FUNCTION public.account_transfers_apply_balances();
