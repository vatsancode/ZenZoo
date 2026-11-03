// Whether a unit takes decimals, by the unit code the screens carry. Filled whenever the
// units list is loaded. The rule comes from each unit's own "Allow decimals" setting - never
// from a particular code - so a unit's code can be edited freely.
const decimalsByCode = new Map<string, boolean>();

export function rememberUnits(units: { code: string; allowDecimals: boolean }[]): void {
  decimalsByCode.clear();
  for (const unit of units) decimalsByCode.set(unit.code, unit.allowDecimals);
}

/**
 * Learns one unit's rule from data that carries it (a till item, a sale line, a purchase line),
 * so screens that never load the units list still know it. Adds to what is known; never clears.
 */
export function learnUnit(code: string, allowDecimals: boolean): void {
  decimalsByCode.set(code, allowDecimals);
}

/**
 * True unless the unit is known to allow decimals (up to 3 places). A unit that is not known yet
 * counts as whole numbers only - the server checks the real rule either way.
 */
export function wholeNumbersOnly(unitCode: string): boolean {
  return decimalsByCode.get(unitCode) !== true;
}
