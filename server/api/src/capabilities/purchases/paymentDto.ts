export interface PurchasePaymentDto {
  id: string;
  purchaseId: string;
  paymentMethodId: string;
  paymentAccountId: string;
  amount: string;
  date: string;
  reference: string | null;
  notes: string | null;
}

interface PurchasePaymentRow {
  id: string;
  purchase_id: string;
  payment_method_id: string;
  payment_account_id: string;
  amount: { toString(): string };
  paid_at: Date;
  reference: string | null;
  notes: string | null;
}

export function toPurchasePaymentDto(row: PurchasePaymentRow): PurchasePaymentDto {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    paymentMethodId: row.payment_method_id,
    paymentAccountId: row.payment_account_id,
    amount: row.amount.toString(),
    date: row.paid_at.toISOString().slice(0, 10),
    reference: row.reference,
    notes: row.notes,
  };
}

export const PURCHASE_PAYMENT_SELECT = {
  id: true,
  purchase_id: true,
  payment_method_id: true,
  payment_account_id: true,
  amount: true,
  paid_at: true,
  reference: true,
  notes: true,
} as const;
