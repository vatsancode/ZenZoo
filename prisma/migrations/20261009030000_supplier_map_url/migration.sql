-- suppliers.map_url: a Google Maps link to the supplier's location. Real
-- field in the admin UI's vendor form/detail page (apps/admin/features/
-- vendors/vendors.ts's VendorInput.mapUrl) that this table never had a
-- column for. Nullable, no format CHECK - the UI's own mapUrlProblem()
-- already validates the Google-Maps-link shape before this is ever
-- written, the same division of labor sku/email already have here.
ALTER TABLE suppliers ADD COLUMN map_url VARCHAR(500);
