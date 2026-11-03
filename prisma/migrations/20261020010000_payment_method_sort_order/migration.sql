-- A shop can drag its payment methods into its own order. NULL means "not placed":
-- methods with no number list A-Z (English, then Tamil, then the rest) after any placed ones,
-- so nothing changes until someone drags. reorderPaymentMethods numbers them 1, 2, 3 ...;
-- resetPaymentMethodOrder sets them all back to NULL.
ALTER TABLE public.payment_methods ADD COLUMN sort_order integer;

ALTER TABLE public.payment_methods
    ADD CONSTRAINT payment_methods_sort_order_check CHECK (sort_order IS NULL OR sort_order > 0);
