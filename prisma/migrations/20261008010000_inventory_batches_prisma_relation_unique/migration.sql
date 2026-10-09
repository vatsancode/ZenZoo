-- prisma/README.md already documents the awkward shape here:
-- inventory_batches.sale_return_item_id is genuinely one-to-one with
-- sale_return_items (enforced by inventory_batches_sale_return_item_unique,
-- a UNIQUE on that single column), but the @relation for it uses the wider
-- tuple (tenant_id, store_id, sale_return_item_id, variant_id), and Prisma's
-- relation validator wants a @@unique covering that exact tuple, not just a
-- subset of it - the README's own prior conclusion was that adding one
-- purely to satisfy Prisma wasn't worth it.
--
-- That conclusion no longer holds now that this is a hard `prisma generate`
-- failure (P1012) under the currently installed Prisma CLI (6.19.3), not
-- just an imprecise type - generate cannot succeed AT ALL while this is
-- missing, blocking every model's client, not only this one relation. A
-- redundant composite unique index is a small, inert cost (it can never be
-- violated independently of the single-column unique it duplicates) against
-- "nobody can run `prisma generate`."
ALTER TABLE inventory_batches
    ADD CONSTRAINT inventory_batches_sale_return_item_relation_unique
    UNIQUE (tenant_id, store_id, sale_return_item_id, variant_id);
