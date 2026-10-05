// Sample options standing in for the tenant's `payment_methods` and the store's
// `payment_accounts` tables (docs/db-design.md), which have no read capability on
// the backend yet. Customer credit is left out: it isn't money leaving an account.

export interface PaymentMethod {
  value: string;
  label: string;
  enabled: boolean;
}

/** Every method the shop has ever offered. Turning one off hides it from pickers but keeps its history. */
let methods: PaymentMethod[] = [
  { value: "CASH", label: "Cash", enabled: true },
  { value: "UPI", label: "UPI", enabled: true },
  { value: "CARD", label: "Card", enabled: true },
  { value: "BANK_TRANSFER", label: "Bank transfer", enabled: true },
];

/**
 * The methods that can be picked right now. Mutable on purpose: switching a method on or
 * off in Settings keeps this list in step, so every picker across the app agrees.
 */
export const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = methods
  .filter((method) => method.enabled)
  .map(({ value, label }) => ({ value, label }));

function syncMethods() {
  PAYMENT_METHOD_OPTIONS.splice(
    0,
    PAYMENT_METHOD_OPTIONS.length,
    ...methods.filter((method) => method.enabled).map(({ value, label }) => ({ value, label })),
  );
}

export function listPaymentMethods(): PaymentMethod[] {
  return methods;
}

/** Returns an error message when the change isn't allowed, or null. At least one method stays on. */
export function setPaymentMethodEnabled(value: string, enabled: boolean): string | null {
  if (!enabled && methods.filter((method) => method.enabled).length <= 1) {
    return "At least one payment method has to stay on.";
  }
  methods = methods.map((method) => (method.value === value ? { ...method, enabled } : method));
  syncMethods();
  return null;
}

/** Adds a method of the shop's own, like Cheque or a wallet. Returns an error message, or null. */
export function addPaymentMethod(label: string): string | null {
  const name = label.trim();
  if (name === "") return "Enter a name for the payment method.";
  if (methods.some((method) => method.label.toLowerCase() === name.toLowerCase())) {
    return "There is already a payment method with that name.";
  }
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  methods = [...methods, { value: code || `METHOD_${Date.now()}`, label: name, enabled: true }];
  syncMethods();
  return null;
}

/**
 * The accounts that can be picked right now (not disabled). Mutable on purpose: managing
 * accounts in Settings (lib/accounts.ts) keeps this list in step.
 */
export const PAYMENT_ACCOUNT_OPTIONS: { value: string; label: string }[] = [
  { value: "cash-drawer", label: "Cash drawer" },
  { value: "hdfc-current", label: "HDFC Current Account" },
  { value: "icici-savings", label: "ICICI Savings Account" },
];

/** Every account's name, disabled ones included, so history still reads properly. */
export const PAYMENT_ACCOUNT_LABELS: { value: string; label: string }[] = [
  ...PAYMENT_ACCOUNT_OPTIONS,
];

export function accountLabel(id: string): string {
  return PAYMENT_ACCOUNT_LABELS.find((account) => account.value === id)?.label ?? id;
}

/** A sale paid entirely with store credit has this as its method, and no account. */
export const STORE_CREDIT = "STORE_CREDIT";

/** A part of a sale left unpaid, to be collected from the customer later. */
export const ON_ACCOUNT = "ON_ACCOUNT";

/** The label for any payment method code, including store credit, even for one turned off since. */
export function paymentMethodLabel(code: string): string {
  if (code === STORE_CREDIT) return "Store credit";
  if (code === ON_ACCOUNT) return "On account";
  return methods.find((method) => method.value === code)?.label ?? code;
}
