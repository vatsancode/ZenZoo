# Shared

Cross-cutting backend infrastructure used by more than one module -
the Prisma client singleton, and anything else of that shape. Not a place
for business logic, and not a place for types that belong in `@zenzoo/types`
instead (anything POS/Admin would also need to import belongs there, not
here).
