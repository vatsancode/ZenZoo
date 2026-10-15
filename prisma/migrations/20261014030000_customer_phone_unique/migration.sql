-- At the till a customer is found by phone, so two active customers can't
-- share one. Archived customers are left out: archiving someone frees their
-- number for whoever has it now. Phones are stored normalised by the app
-- (digits and an optional leading +), so "98765 43210" and "98765-43210"
-- collide here as they should.
CREATE UNIQUE INDEX customers_tenant_phone_active_unique
    ON public.customers USING btree (tenant_id, phone)
    WHERE ((status)::text = 'active' AND phone IS NOT NULL);
