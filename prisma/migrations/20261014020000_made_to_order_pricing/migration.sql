-- How a made-to-order item is priced: one set price ('fixed', kept on its
-- variant's base_price like any product), or agreed per order at the till
-- ('custom' - base_price is then 0 and ignored). A column rather than
-- "price 0 means custom", so a genuinely free item stays expressible.
-- Products are always 'fixed': their price is per variant, set in Stocks.

ALTER TABLE public.sellables
    ADD COLUMN pricing_mode character varying(10) NOT NULL DEFAULT 'fixed';
ALTER TABLE public.sellables
    ADD CONSTRAINT sellables_pricing_mode_check
    CHECK ((pricing_mode)::text = ANY (ARRAY['fixed', 'custom']::text[]));
ALTER TABLE public.sellables
    ADD CONSTRAINT sellables_product_fixed_pricing_check
    CHECK ((kind)::text <> 'product' OR (pricing_mode)::text = 'fixed');
