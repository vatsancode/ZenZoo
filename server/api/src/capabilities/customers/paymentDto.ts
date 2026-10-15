/** Money a customer paid towards what they owe - a CREDIT_PAYMENT entry in the ledger. */
export interface CustomerPaymentDto {
  id: string;
  customerId: string;
  /** When it was received. */
  receivedAt: string;
  /** Always positive, in rupees: "150.00". */
  amount: string;
  paymentMethodId: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  paymentAccountId: string;
  paymentAccountName: string;
  reference: string | null;
  note: string | null;
}

interface PaymentRow {
  id: string;
  customer_id: string;
  created_at: Date;
  amount: {
    toFixed(decimalPlaces: number): string;
    negated(): { toFixed(decimalPlaces: number): string };
  };
  payment_method_id: string | null;
  payment_account_id: string | null;
  reference: string | null;
  notes: string | null;
}

/** Ledger rows hold the method and account as plain ids, so their names are looked up alongside. */
export function toCustomerPaymentDto(
  row: PaymentRow,
  methods: Map<string, { code: string; name: string }>,
  accounts: Map<string, { name: string }>,
): CustomerPaymentDto {
  const method = row.payment_method_id ? methods.get(row.payment_method_id) : undefined;
  const account = row.payment_account_id ? accounts.get(row.payment_account_id) : undefined;
  return {
    id: row.id,
    customerId: row.customer_id,
    receivedAt: row.created_at.toISOString(),
    amount: row.amount.negated().toFixed(2),
    paymentMethodId: row.payment_method_id ?? "",
    paymentMethodCode: method?.code ?? "",
    paymentMethodName: method?.name ?? "",
    paymentAccountId: row.payment_account_id ?? "",
    paymentAccountName: account?.name ?? "",
    reference: row.reference,
    note: row.notes,
  };
}

export const PAYMENT_SELECT = {
  id: true,
  customer_id: true,
  created_at: true,
  amount: true,
  payment_method_id: true,
  payment_account_id: true,
  reference: true,
  notes: true,
} as const;
