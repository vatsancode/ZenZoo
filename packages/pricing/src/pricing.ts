/** Whole paise - 1/100 of a rupee. Every money amount in this package is an integer number of these. */
export type Paise = number;

/** A discount as it was chosen, not as a rupee figure - the figure depends on what it is taken off. */
export type Discount = { type: "amount"; paise: Paise } | { type: "percent"; percent: number };

export interface PriceLineInput {
  /** What one unit costs, before any discount. */
  unitPrice: Paise;
  quantity: number;
  /** Taken off this line on its own. */
  discount?: Discount;
}

export interface PriceCartInput {
  lines: PriceLineInput[];
  /** Taken off what is left after each line's own discount, then spread across the lines. */
  billDiscount?: Discount;
}

export interface PricedLine {
  /** quantity x unit price, before any discount. */
  gross: Paise;
  /** This line's own discount. */
  lineDiscount: Paise;
  /** This line's share of the bill discount. */
  billShare: Paise;
  /** lineDiscount + billShare - the figure the database stores as the line's discount_amount. */
  discount: Paise;
  /** What the customer pays for the line: gross - discount (the database's line_total). */
  net: Paise;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: Paise;
  /** Sum of the lines' own discounts. */
  lineDiscounts: Paise;
  /** The bill discount actually taken - never more than was left to take it from. */
  billDiscount: Paise;
  total: Paise;
}

/** Thrown for input no honest till or server should ever send (negative or fractional paise, NaN...). */
export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

/**
 * Rupees to paise, half-up. toFixed first so float noise (1.005 * 100 = 100.4999...)
 * can't tip a rounding the wrong way.
 */
export function toPaise(rupees: number | string): Paise {
  const value = Number(rupees);
  if (!Number.isFinite(value)) throw new PricingError(`Not an amount: ${String(rupees)}`);
  return Math.round(Number((value * 100).toFixed(6)));
}

export function toRupees(paise: Paise): number {
  return paise / 100;
}

/**
 * Reads what a person typed into a discount box (a rupee amount or a percentage).
 * Blank, zero, negative or unreadable means no discount; a percentage is capped at 100.
 */
export function parseTypedDiscount(
  typed: string,
  type: "amount" | "percent",
): Discount | undefined {
  const value = typed.trim() === "" ? 0 : Number(typed);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return type === "percent"
    ? { type: "percent", percent: Math.min(value, 100) }
    : { type: "amount", paise: toPaise(value) };
}

function assertPaise(value: number, what: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PricingError(`${what} must be a whole number of paise, 0 or more (got ${value}).`);
  }
}

/** Paise off `base` for a discount - never below 0, never above `base`. */
function discountOf(base: Paise, discount: Discount | undefined): Paise {
  if (!discount || base <= 0) return 0;
  let raw: Paise;
  if (discount.type === "percent") {
    if (!Number.isFinite(discount.percent))
      throw new PricingError("The discount percentage isn't a number.");
    // Basis points (1/100 of a percent), so 12.5% is exact. BigInt: base x basis points can pass 2^53.
    const basisPoints = BigInt(Math.round(Math.min(Math.max(discount.percent, 0), 100) * 100));
    raw = Number((BigInt(base) * basisPoints + BigInt(5000)) / BigInt(10000));
  } else {
    assertPaise(discount.paise, "A discount amount");
    raw = discount.paise;
  }
  return Math.min(raw, base);
}

/**
 * Spreads `total` over `weights` in proportion, in whole paise that add up to exactly `total`
 * (largest-remainder: the leftover paise go to the biggest fractional parts, earliest line first).
 */
function allocate(total: Paise, weights: Paise[]): Paise[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0 || weightSum <= 0) return weights.map(() => 0);

  const bigTotal = BigInt(total);
  const bigSum = BigInt(weightSum);
  const parts = weights.map((weight, index) => {
    const product = bigTotal * BigInt(weight);
    return { index, share: product / bigSum, remainder: product % bigSum };
  });

  let leftover = total - parts.reduce((sum, part) => sum + Number(part.share), 0);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const shares = parts.map((part) => Number(part.share));
  for (const part of byRemainder) {
    if (leftover <= 0) break;
    // A line with nothing to take a discount from (weight 0) never gets a share.
    if (weights[part.index] === 0) continue;
    shares[part.index] = (shares[part.index] ?? 0) + 1;
    leftover -= 1;
  }
  return shares;
}

export function priceCart(input: PriceCartInput): PricedCart {
  const firstPass = input.lines.map((line) => {
    assertPaise(line.unitPrice, "A unit price");
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      throw new PricingError(`A quantity must be 0 or more (got ${line.quantity}).`);
    }
    const gross = Math.round(line.quantity * line.unitPrice);
    const lineDiscount = discountOf(gross, line.discount);
    return { gross, lineDiscount, afterLine: gross - lineDiscount };
  });

  const subtotal = firstPass.reduce((sum, line) => sum + line.gross, 0);
  const lineDiscounts = firstPass.reduce((sum, line) => sum + line.lineDiscount, 0);
  const afterLines = subtotal - lineDiscounts;
  const billDiscount = discountOf(afterLines, input.billDiscount);
  const shares = allocate(
    billDiscount,
    firstPass.map((line) => line.afterLine),
  );

  const lines = firstPass.map((line, index): PricedLine => {
    const billShare = shares[index] ?? 0;
    const discount = line.lineDiscount + billShare;
    return {
      gross: line.gross,
      lineDiscount: line.lineDiscount,
      billShare,
      discount,
      net: line.gross - discount,
    };
  });

  return { lines, subtotal, lineDiscounts, billDiscount, total: afterLines - billDiscount };
}
