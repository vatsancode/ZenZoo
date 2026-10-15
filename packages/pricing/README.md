# @zenzoo/pricing

The one place a sale's money is worked out: line amounts, line and bill discounts, totals.

Used by every till (admin web, the native POS) and by the server, so they can never disagree
by a paisa. Pure functions only - no network, no database, no UI, no dates.

- **Every amount is an integer number of paise** (1 rupee = 100 paise). No floats ever hold money.
  Convert at the edges with `toPaise` / `toRupees`.
- **A bill discount is spread across the lines** (largest-remainder, so the pieces add up to
  the exact amount). The database requires `sales.discount_amount` to equal the sum of the line
  discounts, so a bill discount has no number of its own to store.
- **Rounding** is half-up, once per line gross and once per percent discount.

Source-only package, like `@zenzoo/types`: consumers compile it (Next via `transpilePackages`,
the API via `tsx`). Run the tests with `pnpm --filter @zenzoo/pricing test`.
