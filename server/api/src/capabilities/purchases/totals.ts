import { UserFacingError } from "../../shared/errors";
import { toPaise, toThousandths } from "@zenzoo/pricing";
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

// quantity × cost to the paisa, worked in whole thousandths and paise so a part-quantity
// (1.25 kg) rounds exactly as the database's round(quantity * unit_cost, 2) does.
const lineGross = (quantity: number, unitCost: number) =>
  Math.round((toThousandths(quantity) * toPaise(unitCost)) / 1000) / 100;

/**
 * One tax amount for the whole bill, split across the lines by what each is worth after its own
 * discount - the database keeps tax per line (check_purchase_totals sums it into the header), so
 * the header shows exactly the amount typed. Worked in paise; the last line takes the rounding
 * remainder. Lines worth nothing share it equally.
 */
function spreadByValue(amount: number, values: number[]): number[] {
  const totalPaise = toPaise(amount);
  if (totalPaise === 0 || values.length === 0) return values.map(() => 0);
  const weights = values.map((value) => toPaise(value));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weights.map((weight) =>
    weightSum > 0
      ? Math.floor((totalPaise * weight) / weightSum)
      : Math.floor(totalPaise / values.length),
  );
  const assigned = shares.reduce((sum, share) => sum + share, 0);
  shares[shares.length - 1]! += totalPaise - assigned;
  return shares.map((share) => share / 100);
}

/**
 * Mirrors check_purchase_totals() and purchase_items_line_total_check
 * exactly (docs/db-design.md) - computed here, not trusted from the
 * caller, so the header this writes can never disagree with its own
 * lines by the time either CHECK/trigger runs.
 */
export function computeTotals(
  items: PurchaseLineInput[],
  adjustmentAmount: number,
  billTax = 0,
): ComputedTotals {
  if (!Number.isFinite(billTax) || billTax < 0) throw new UserFacingError("Tax can't be negative.");
  if (!Number.isFinite(adjustmentAmount)) throw new UserFacingError("Enter a valid discount.");

  const nets = items.map((item) => {
    const discountAmount = item.discountAmount ?? 0;
    const gross = lineGross(item.quantity, item.unitCost);
    if (discountAmount > gross) {
      throw new UserFacingError("A line's discount can't be more than its own quantity × cost.");
    }
    return gross - discountAmount;
  });
  const billTaxShares = spreadByValue(billTax, nets);

  const lines = items.map((item, index) => {
    const discountAmount = item.discountAmount ?? 0;
    const taxAmount = round2((item.taxAmount ?? 0) + billTaxShares[index]!);
    const gross = lineGross(item.quantity, item.unitCost);
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      discountAmount,
      taxAmount,
      lineTotal: round2(gross - discountAmount + taxAmount),
    };
  });

  const subtotalAmount = round2(
    lines.reduce((sum, line) => sum + lineGross(line.quantity, line.unitCost), 0),
  );
  const discountAmount = round2(lines.reduce((sum, line) => sum + line.discountAmount, 0));
  const taxAmount = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const totalAmount = round2(subtotalAmount - discountAmount + taxAmount + adjustmentAmount);
  if (totalAmount < 0) throw new UserFacingError("The discount is more than the purchase value.");

  return { lines, subtotalAmount, discountAmount, taxAmount, totalAmount };
}
