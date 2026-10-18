import type { SaleDto } from "./dto";

/**
 * A sale as the Customers screens see it: what someone bought, what they were charged and how
 * they paid - enough for their purchase history, what they like to buy, their store credit and
 * what they owe. Not what it cost the shop (line costs), which accounts the money went into, or
 * who made the sale - that's Sales and Settings territory.
 */
export interface CustomerSaleDto {
  id: string;
  number: string | null;
  customerId: string | null;
  customerName: string | null;
  soldAt: string;
  subtotal: string;
  discount: string;
  billDiscount: string;
  total: string;
  status: SaleDto["status"];
  voidReason: string | null;
  lines: Omit<SaleDto["lines"][number], "cost" | "lineDiscountType" | "lineDiscountValue">[];
  returns: Pick<
    SaleDto["returns"][number],
    | "id"
    | "number"
    | "createdAt"
    | "reason"
    | "note"
    | "refundMode"
    | "value"
    | "refundAmount"
    | "refundMethodCode"
    | "items"
  >[];
  payments: Pick<
    SaleDto["payments"][number],
    "paymentMethodCode" | "paymentMethodName" | "amount"
  >[];
}

export function toCustomerSaleDto(sale: SaleDto): CustomerSaleDto {
  return {
    id: sale.id,
    number: sale.number,
    customerId: sale.customerId,
    customerName: sale.customerName,
    soldAt: sale.soldAt,
    subtotal: sale.subtotal,
    discount: sale.discount,
    billDiscount: sale.billDiscount,
    total: sale.total,
    status: sale.status,
    voidReason: sale.voidReason,
    lines: sale.lines.map(({ cost: _cost, lineDiscountType: _t, lineDiscountValue: _v, ...line }) => line),
    returns: sale.returns.map((ret) => ({
      id: ret.id,
      number: ret.number,
      createdAt: ret.createdAt,
      reason: ret.reason,
      note: ret.note,
      refundMode: ret.refundMode,
      value: ret.value,
      refundAmount: ret.refundAmount,
      refundMethodCode: ret.refundMethodCode,
      items: ret.items,
    })),
    payments: sale.payments.map((payment) => ({
      paymentMethodCode: payment.paymentMethodCode,
      paymentMethodName: payment.paymentMethodName,
      amount: payment.amount,
    })),
  };
}
