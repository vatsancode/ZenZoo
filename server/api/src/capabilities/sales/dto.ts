export interface SaleLineDto {
  id: string;
  variantId: string;
  /** The catalogue item (sellable) this variant belongs to. */
  productId: string;
  productName: string;
  variantName: string;
  categoryName: string;
  sku: string | null;
  unit: string;
  /** A made-to-order item (a service) rather than counted stock. */
  service: boolean;
  quantity: number;
  unitPrice: string;
  /** The line's own discount as typed ("10%" or "Rs 50"), when it had one. */
  lineDiscountType: "amount" | "percent" | null;
  lineDiscountValue: string | null;
  /** Everything taken off this line: its own discount plus its share of the bill discount. */
  discount: string;
  billShare: string;
  /** What the customer paid for the line. */
  lineTotal: string;
  /** What the units sold cost to buy, from the batches they came out of. "0.00" for a service. */
  cost: string;
}

export interface SalePaymentDto {
  id: string;
  paymentMethodId: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  amount: string;
  reference: string | null;
}

export interface SaleDto {
  id: string;
  /** The receipt number, e.g. A-000124. */
  number: string | null;
  storeId: string;
  customerId: string | null;
  /** null for a walk-in. */
  customerName: string | null;
  /** When the sale happened. */
  soldAt: string;
  source: "admin" | "pos";
  status: "draft" | "completed" | "voided";
  subtotal: string;
  /** Everything taken off - line discounts plus the bill discount. */
  discount: string;
  billDiscountType: "amount" | "percent" | null;
  billDiscountValue: string | null;
  billDiscount: string;
  discountReason: string | null;
  total: string;
  lines: SaleLineDto[];
  payments: SalePaymentDto[];
}

/** A Prisma Decimal (or anything shaped like one). */
interface Money {
  toFixed(decimalPlaces: number): string;
  toNumber(): number;
}

/** Two decimals always ("250.00", never "250"), the same as previewSale's amounts. */
const rupees = (value: Money): string => value.toFixed(2);

interface SaleRow {
  id: string;
  store_id: string;
  customer_id: string | null;
  customers: { name: string } | null;
  sale_number: string | null;
  sold_at: Date;
  source: string;
  status: string;
  subtotal_amount: Money;
  discount_amount: Money;
  bill_discount_type: string | null;
  bill_discount_value: Money | null;
  bill_discount_amount: Money;
  discount_reason: string | null;
  total_amount: Money;
  sale_items: {
    id: string;
    variant_id: string;
    quantity: number;
    unit_price: Money;
    discount_amount: Money;
    bill_discount_share: Money;
    line_discount_type: string | null;
    line_discount_value: Money | null;
    line_total: Money;
    variants: {
      name: string;
      sku: string | null;
      units: { code: string };
      sellables: { id: string; name: string; kind: string; categories: { name: string } };
    };
    sale_item_batches: { quantity: number; inventory_batches: { unit_cost: Money } }[];
  }[];
  sale_payments: {
    id: string;
    payment_method_id: string;
    payment_account_id: string | null;
    amount: Money;
    reference: string | null;
    payment_methods: { name: string; code: string };
    payment_accounts: { name: string } | null;
  }[];
}

const kind = (value: string | null): "amount" | "percent" | null =>
  value === "amount" || value === "percent" ? value : null;

export function toSaleDto(row: SaleRow): SaleDto {
  return {
    id: row.id,
    number: row.sale_number,
    storeId: row.store_id,
    customerId: row.customer_id,
    customerName: row.customers?.name ?? null,
    soldAt: row.sold_at.toISOString(),
    source: row.source === "pos" ? "pos" : "admin",
    status: row.status === "voided" ? "voided" : row.status === "draft" ? "draft" : "completed",
    subtotal: rupees(row.subtotal_amount),
    discount: rupees(row.discount_amount),
    billDiscountType: kind(row.bill_discount_type),
    billDiscountValue: row.bill_discount_value ? rupees(row.bill_discount_value) : null,
    billDiscount: rupees(row.bill_discount_amount),
    discountReason: row.discount_reason,
    total: rupees(row.total_amount),
    lines: row.sale_items.map((item) => {
      // Cost in paise so summing several batches stays exact (unit_cost has two decimals).
      const costPaise = item.sale_item_batches.reduce(
        (sum, part) =>
          sum + part.quantity * Math.round(part.inventory_batches.unit_cost.toNumber() * 100),
        0,
      );
      return {
        id: item.id,
        variantId: item.variant_id,
        productId: item.variants.sellables.id,
        productName: item.variants.sellables.name,
        variantName: item.variants.name,
        categoryName: item.variants.sellables.categories.name,
        sku: item.variants.sku,
        unit: item.variants.units.code,
        service: item.variants.sellables.kind === "made_to_order",
        quantity: item.quantity,
        unitPrice: rupees(item.unit_price),
        lineDiscountType: kind(item.line_discount_type),
        lineDiscountValue: item.line_discount_value ? rupees(item.line_discount_value) : null,
        discount: rupees(item.discount_amount),
        billShare: rupees(item.bill_discount_share),
        lineTotal: rupees(item.line_total),
        cost: (costPaise / 100).toFixed(2),
      };
    }),
    payments: row.sale_payments.map((payment) => ({
      id: payment.id,
      paymentMethodId: payment.payment_method_id,
      paymentMethodCode: payment.payment_methods.code,
      paymentMethodName: payment.payment_methods.name,
      paymentAccountId: payment.payment_account_id,
      paymentAccountName: payment.payment_accounts?.name ?? null,
      amount: rupees(payment.amount),
      reference: payment.reference,
    })),
  };
}

export const SALE_SELECT = {
  id: true,
  store_id: true,
  customer_id: true,
  customers: { select: { name: true } },
  sale_number: true,
  sold_at: true,
  source: true,
  status: true,
  subtotal_amount: true,
  discount_amount: true,
  bill_discount_type: true,
  bill_discount_value: true,
  bill_discount_amount: true,
  discount_reason: true,
  total_amount: true,
  // uuidv7 ids are time-ordered; created_at can't order rows made in one transaction (all equal).
  sale_items: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      variant_id: true,
      quantity: true,
      unit_price: true,
      discount_amount: true,
      bill_discount_share: true,
      line_discount_type: true,
      line_discount_value: true,
      line_total: true,
      variants: {
        select: {
          name: true,
          sku: true,
          units: { select: { code: true } },
          sellables: {
            select: { id: true, name: true, kind: true, categories: { select: { name: true } } },
          },
        },
      },
      sale_item_batches: {
        select: { quantity: true, inventory_batches: { select: { unit_cost: true } } },
      },
    },
  },
  sale_payments: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      payment_method_id: true,
      payment_account_id: true,
      amount: true,
      reference: true,
      payment_methods: { select: { name: true, code: true } },
      payment_accounts: { select: { name: true } },
    },
  },
} as const;
