-- Same as payment_methods.sort_order: a shop can drag its units into its own order. NULL means
-- "not placed" - those list A-Z (English, then Tamil, then the rest) after any placed ones, so
-- nothing changes until someone drags. reorderUnits numbers them 1, 2, 3 ...;
-- resetUnitOrder sets them all back to NULL.
ALTER TABLE public.units ADD COLUMN sort_order integer;

ALTER TABLE public.units
    ADD CONSTRAINT units_sort_order_check CHECK (sort_order IS NULL OR sort_order > 0);
