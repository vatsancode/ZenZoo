-- variants.unit: the unit a variant's quantity is counted in ("pcs", "kg",
-- ...). Free-text, no CHECK - apps/admin/features/stocks/stocks.ts already
-- lets a tenant add custom units beyond the five built-in ones, so this
-- column has to accept whatever that list currently holds, not a fixed set.
-- NOT NULL DEFAULT 'pcs': every variant needs a unit to be meaningfully
-- stocked, and 'pcs' is the universal fallback the mock already uses for
-- anything that isn't explicitly weighed/measured.
ALTER TABLE variants ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT 'pcs';
