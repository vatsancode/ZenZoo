export interface ExpenseCategoryDto {
  id: string;
  name: string;
  /** The protected "Other" heading: can't be renamed or deleted. */
  isCatchAll: boolean;
  /** Items filed under it, the bills they sit on, and what has been billed. */
  items: number;
  bills: number;
  spent: string;
}

interface ExpenseCategoryRow {
  id: string;
  name: string;
  is_catch_all: boolean;
}

export interface ExpenseCategoryUsage {
  items: number;
  bills: number;
  spent: number;
}

export function toExpenseCategoryDto(
  row: ExpenseCategoryRow,
  usage: ExpenseCategoryUsage = { items: 0, bills: 0, spent: 0 },
): ExpenseCategoryDto {
  return {
    id: row.id,
    name: row.name,
    isCatchAll: row.is_catch_all,
    items: usage.items,
    bills: usage.bills,
    spent: usage.spent.toFixed(2),
  };
}

export const EXPENSE_CATEGORY_SELECT = { id: true, name: true, is_catch_all: true } as const;
