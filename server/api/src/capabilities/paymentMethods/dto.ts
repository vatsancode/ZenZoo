export interface PaymentMethodDto {
  id: string;
  name: string;
  code: string;
  status: "active" | "disabled";
  /** Where the shop placed it (1, 2, 3 ...), or null while it follows the A-Z default. */
  sortOrder: number | null;
  /** One every shop starts with (Cash, UPI, Card, Bank transfer, Store credit, On account) - its name can't change. */
  builtIn: boolean;
}

interface PaymentMethodRow {
  id: string;
  name: string;
  code: string;
  status: string;
  sort_order: number | null;
  is_customer_credit: boolean;
}

/**
 * The till acts on these codes (CASH asks for the money handed over, for one), so their names
 * stay as they are: renaming Cash to Wallet would leave the till treating "Wallet" as cash.
 * The customer-credit methods (Store credit, On account) are locked the same way.
 */
const BUILT_IN_CODES: readonly string[] = ["CASH", "UPI", "CARD", "BANK_TRANSFER"];

export function isBuiltInPaymentMethod(row: Pick<PaymentMethodRow, "code" | "is_customer_credit">) {
  return row.is_customer_credit || BUILT_IN_CODES.includes(row.code);
}

export function toPaymentMethodDto(row: PaymentMethodRow): PaymentMethodDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status === "disabled" ? "disabled" : "active",
    sortOrder: row.sort_order,
    builtIn: isBuiltInPaymentMethod(row),
  };
}

export const PAYMENT_METHOD_SELECT = {
  id: true,
  name: true,
  code: true,
  status: true,
  sort_order: true,
  is_customer_credit: true,
} as const;
