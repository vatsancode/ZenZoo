/**
 * Stock quantities. The database keeps them as numeric(12,3) - up to three decimal places, a
 * gram in a kilo - and every app passes them around as plain numbers. Anything that adds,
 * subtracts or compares them goes through here, in whole thousandths, so float noise
 * (0.1 + 0.2 = 0.30000000000000004) never reaches a stock count.
 */

export const QUANTITY_DECIMALS = 3;
const SCALE = 10 ** QUANTITY_DECIMALS;

/** A quantity as whole thousandths: 1.5 -> 1500. */
export function toThousandths(quantity: number): number {
  return Math.round(Number((quantity * SCALE).toFixed(6)));
}

/** Rounds a quantity to the three places the database keeps. */
export function roundQuantity(quantity: number): number {
  return toThousandths(quantity) / SCALE;
}

export function addQuantities(...quantities: number[]): number {
  return quantities.reduce((sum, quantity) => sum + toThousandths(quantity), 0) / SCALE;
}

export function subtractQuantity(from: number, take: number): number {
  return (toThousandths(from) - toThousandths(take)) / SCALE;
}

/** True for a finite number with no more than three decimal places. */
export function hasQuantityPrecision(quantity: number): boolean {
  return Number.isFinite(quantity) && Math.abs(quantity * SCALE - toThousandths(quantity)) < 1e-6;
}

/**
 * Why a quantity can't be used, or null when it can. `allowDecimals` is the unit's own setting;
 * `allowZero` is for a count that may honestly be "none left".
 */
export function quantityIssue(
  quantity: number,
  allowDecimals: boolean,
  { allowZero = false, unit = "" }: { allowZero?: boolean; unit?: string } = {},
): string | null {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) return "Enter a quantity.";
  if (quantity < 0 || (quantity === 0 && !allowZero)) {
    return allowZero ? "Enter 0 or more." : "Enter a quantity above 0.";
  }
  if (!allowDecimals && !Number.isInteger(quantity)) {
    return unit ? `${unit} is counted in whole numbers.` : "Enter a whole number.";
  }
  if (!hasQuantityPrecision(quantity)) return "Use at most 3 decimal places.";
  return null;
}
