// Sample options standing in for the tenant's `payment_methods` and the store's
// `payment_accounts` tables (docs/db-design.md), which have no read capability on
// the backend yet. Customer credit is left out: it isn't money leaving an account.
export const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
];

// Mutable on purpose: managing accounts in Settings (lib/accounts.ts) keeps this list in
// step, so every account picker across the app offers the same up-to-date set.
export const PAYMENT_ACCOUNT_OPTIONS: { value: string; label: string }[] = [
  { value: "cash-drawer", label: "Cash drawer" },
  { value: "hdfc-current", label: "HDFC Current Account" },
  { value: "icici-savings", label: "ICICI Savings Account" },
];

/** A sale paid entirely with store credit has this as its method, and no account. */
export const STORE_CREDIT = "STORE_CREDIT";

/** The label for any payment method code, including store credit. */
export function paymentMethodLabel(code: string): string {
  if (code === STORE_CREDIT) return "Store credit";
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === code)?.label ?? code;
}
