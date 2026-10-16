-- Real expenses: a bill the shop owes or has paid, with the items it covered.
--
-- A bill is either 'pending' (received, to be paid later) or 'paid'. Only a
-- paid bill moves money: its payment account's balance drops by the bill's
-- total, through the same adjust_account_balance() transfers and purchase
-- payments use. Deleting a paid bill, editing its total, moving it to another
-- account or putting it back to pending puts the money right again - unlike
-- purchase_payments these rows are editable, so the trigger handles every
-- change instead of the table being write-once.
--
-- expense_lines point at expense_categories with ON DELETE RESTRICT, so a
-- category that is in use can't be deleted.

CREATE TABLE public.expenses (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    store_id uuid NOT NULL,
    expense_date date NOT NULL,
    payee character varying(200),
    reference character varying(100),
    note character varying(500),
    status character varying(20) DEFAULT 'paid'::character varying NOT NULL,
    due_date date,
    paid_date date,
    payment_account_id uuid,
    total numeric(14,2) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_pkey PRIMARY KEY (id),
    CONSTRAINT expenses_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying])::text[]))),
    CONSTRAINT expenses_total_check CHECK (total > 0),
    -- paid means it names the account and the day; pending means it names neither.
    CONSTRAINT expenses_payment_consistency_check CHECK (
        (status = 'paid' AND payment_account_id IS NOT NULL AND paid_date IS NOT NULL)
        OR (status = 'pending' AND payment_account_id IS NULL AND paid_date IS NULL)
    ),
    CONSTRAINT expenses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
    CONSTRAINT expenses_store_fk FOREIGN KEY (tenant_id, store_id) REFERENCES public.stores(tenant_id, id),
    CONSTRAINT expenses_account_fk FOREIGN KEY (tenant_id, store_id, payment_account_id) REFERENCES public.payment_accounts(tenant_id, store_id, id),
    CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

CREATE UNIQUE INDEX expenses_tenant_id_id_unique ON public.expenses USING btree (tenant_id, id);
CREATE INDEX idx_expenses_store_date ON public.expenses USING btree (tenant_id, store_id, expense_date DESC);
CREATE INDEX idx_expenses_store_status ON public.expenses USING btree (tenant_id, store_id, status);

CREATE TRIGGER trg_expenses_set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.expenses USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));
REVOKE ALL ON TABLE public.expenses FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO app_role;

CREATE TABLE public.expense_lines (
    id uuid DEFAULT uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    expense_id uuid NOT NULL,
    position integer DEFAULT 0 NOT NULL,
    description character varying(300) DEFAULT ''::character varying NOT NULL,
    expense_category_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    CONSTRAINT expense_lines_pkey PRIMARY KEY (id),
    CONSTRAINT expense_lines_amount_check CHECK (amount > 0),
    CONSTRAINT expense_lines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
    CONSTRAINT expense_lines_expense_fk FOREIGN KEY (tenant_id, expense_id) REFERENCES public.expenses(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT expense_lines_category_fk FOREIGN KEY (tenant_id, expense_category_id) REFERENCES public.expense_categories(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_expense_lines_expense ON public.expense_lines USING btree (tenant_id, expense_id);
CREATE INDEX idx_expense_lines_category ON public.expense_lines USING btree (tenant_id, expense_category_id);

ALTER TABLE public.expense_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.expense_lines USING ((tenant_id = public.app_current_tenant_id())) WITH CHECK ((tenant_id = public.app_current_tenant_id()));
REVOKE ALL ON TABLE public.expense_lines FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expense_lines TO app_role;

-- Money follows the bill: take back whatever the old row had paid, then pay
-- whatever the new row says it has paid. Putting the old amount back first
-- means a bill can be edited up to what the account holds in total, not just
-- what is left after the old amount.
CREATE FUNCTION public.expenses_apply_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'paid' THEN
        PERFORM public.adjust_account_balance(OLD.payment_account_id, OLD.total);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'paid' THEN
        PERFORM public.adjust_account_balance(NEW.payment_account_id, -NEW.total);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_expenses_apply_balance
    AFTER INSERT OR UPDATE OR DELETE ON public.expenses
    FOR EACH ROW EXECUTE FUNCTION public.expenses_apply_balance();
