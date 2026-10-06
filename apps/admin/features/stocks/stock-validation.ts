import type { Unit } from "./stocks";

export const MAX_QUANTITY = 100000;

/** `allowZero` is for editing existing stock, where "none left" is a valid answer. */
export function quantityProblem(value: string, unit: Unit, allowZero = false): string | null {
  const number = Number(value);
  if (value.trim() === "") return "Enter how many you have.";
  if (Number.isNaN(number) || number < 0 || (number === 0 && !allowZero)) {
    return allowZero ? "Enter 0 or more." : "Enter a number above 0.";
  }
  if (unit === "pcs" && !Number.isInteger(number)) return "Pieces must be a whole number.";
  if (number > MAX_QUANTITY) {
    return `The most you can add at once is ${MAX_QUANTITY.toLocaleString()}.`;
  }
  return null;
}

export function priceProblem(value: string): string | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isNaN(number) || number < 0 ? "Enter a price like 499 or 499.50." : null;
}

export function toPrice(value: string): number {
  return value.trim() === "" ? 0 : Number(value);
}
