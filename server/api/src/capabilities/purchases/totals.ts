export interface PurchaseLineInput {
  variantId: string;
  quantity: number;
  unitCost: number;
  discountAmount?: number;
  taxAmount?: number;
}

export interface ComputedLine {
  variantId: string;
  quantity: number;
  unitCost: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface ComputedTotals {
  lines: ComputedLine[];
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Mirrors check_purchase_totals() and purchase_items_line_total_check
 * exactly (docs/db-design.md) - computed here, not trusted from the
 * caller, so the header this writes can never disagree with its own
 * lines by the time either CHECK/trigger runs.
 */
export function computeTotals(items: PurchaseLineInput[], adjustmentAmount: number): ComputedTotals {
  const lines = items.map((item) => {
    const discountAmount = item.discountAmount ?? 0;
    const taxAmount = item.taxAmount ?? 0;
    const gross = round2(item.quantity * item.unitCost);
    if (discountAmount > gross) {
      throw new Error("A line's discount can't be more than its own quantity × cost.");
    }
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      discountAmount,
      taxAmount,
      lineTotal: round2(gross - discountAmount + taxAmount),
    };
  });

  const subtotalAmount = round2(lines.reduce((sum, line) => sum + round2(line.quantity * line.unitCost), 0));
  const discountAmount = round2(lines.reduce((sum, line) => sum + line.discountAmount, 0));
  const taxAmount = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const totalAmount = round2(subtotalAmount - discountAmount + taxAmount + adjustmentAmount);

  return { lines, subtotalAmount, discountAmount, taxAmount, totalAmount };
}
