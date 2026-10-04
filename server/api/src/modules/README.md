# Modules

Business/domain modules (e.g. `sales/`, `products/`, `inventory/`), created
only once the corresponding product workflow is actually being built - not
a predefined list created upfront.

A module holds the domain logic that `capabilities/actions` and
`capabilities/reads` call into. The logic lives here exactly once; POS,
Admin, internal AI and any future external interface all reach it through
the same capability, never through a second, interface-specific
implementation.
