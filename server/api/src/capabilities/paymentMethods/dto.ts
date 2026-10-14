export interface PaymentMethodDto {
  id: string;
  name: string;
  code: string;
  status: "active" | "disabled";
}

interface PaymentMethodRow {
  id: string;
  name: string;
  code: string;
  status: string;
}

export function toPaymentMethodDto(row: PaymentMethodRow): PaymentMethodDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status === "disabled" ? "disabled" : "active",
  };
}

export const PAYMENT_METHOD_SELECT = {
  id: true,
  name: true,
  code: true,
  status: true,
} as const;
