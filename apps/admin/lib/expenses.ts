/** One thing paid for on a bill: what it was, which category it belongs to, and what it cost. */
export interface ExpenseLine {
  description: string;
  category: string;
  amount: number;
}

/** A bill the shop paid: who was paid, from which account, and everything it covered. */
export interface Expense {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Who was paid. */
  payee?: string;
  /** The bill or receipt number, if there is one. */
  reference?: string;
  /** The account the money was paid from, e.g. "cash-drawer". */
  accountId: string;
  note?: string;
  lines: ExpenseLine[];
  total: number;
}

export interface ExpenseInput {
  date: string;
  payee: string;
  reference: string;
  accountId: string;
  note: string;
  lines: ExpenseLine[];
}

// Sample data standing in for a real capability, same as lib/stocks.ts: there is no
// expenses capability on the backend yet. Swap these bodies for real API calls once
// one exists.
let categories: string[] = [
  "Rent",
  "Salaries",
  "Electricity",
  "Transport",
  "Packaging",
  "Marketing",
  "Repairs",
  "Tea and snacks",
  "Other",
];

const round = (value: number) => Math.round(value * 100) / 100;
const totalOf = (lines: ExpenseLine[]) => round(lines.reduce((sum, line) => sum + line.amount, 0));

function bill(
  id: string,
  date: string,
  accountId: string,
  lines: ExpenseLine[],
  extra: { payee?: string; reference?: string; note?: string } = {},
): Expense {
  return { id, date, accountId, lines, total: totalOf(lines), ...extra };
}

let expenses: Expense[] = [
  bill(
    "exp-1",
    "2026-09-01",
    "hdfc-current",
    [{ description: "Shop rent, September", category: "Rent", amount: 45000 }],
    { payee: "Mr. Subramanian (landlord)" },
  ),
  bill(
    "exp-2",
    "2026-09-05",
    "hdfc-current",
    [
      { description: "Sales staff, 2 people", category: "Salaries", amount: 26000 },
      { description: "Cashier", category: "Salaries", amount: 12000 },
    ],
    { payee: "Staff", note: "September salaries" },
  ),
  bill(
    "exp-3",
    "2026-09-12",
    "hdfc-current",
    [{ description: "Electricity bill", category: "Electricity", amount: 3850 }],
    { payee: "TNEB", reference: "TN-5521904" },
  ),
  bill(
    "exp-4",
    "2026-09-18",
    "cash-drawer",
    [
      { description: "Carry bags, 500", category: "Packaging", amount: 1400 },
      { description: "Tissue paper rolls", category: "Packaging", amount: 600 },
      { description: "Gift boxes", category: "Packaging", amount: 400 },
    ],
    { payee: "Sri Packaging Works", reference: "SPW-2210" },
  ),
  bill(
    "exp-5",
    "2026-09-27",
    "cash-drawer",
    [
      { description: "Freight, Surat consignment", category: "Transport", amount: 1500 },
      { description: "Loading and unloading", category: "Transport", amount: 300 },
    ],
    { payee: "Murugan Lorry Service" },
  ),
  bill(
    "exp-6",
    "2026-10-01",
    "hdfc-current",
    [{ description: "Shop rent, October", category: "Rent", amount: 45000 }],
    { payee: "Mr. Subramanian (landlord)" },
  ),
  bill(
    "exp-7",
    "2026-10-03",
    "icici-savings",
    [
      { description: "Festival hoardings, 3 locations", category: "Marketing", amount: 5000 },
      { description: "Flex printing", category: "Marketing", amount: 1500 },
    ],
    { payee: "Bright Signs", reference: "BS/0917", note: "Festival season" },
  ),
  bill("exp-8", "2026-10-04", "cash-drawer", [
    { description: "Tea and snacks for staff", category: "Tea and snacks", amount: 420 },
  ]),
];

export async function listExpenses(): Promise<Expense[]> {
  return expenses;
}

export function listExpenseCategories(): string[] {
  return categories;
}

function rememberCategories(lines: ExpenseLine[]) {
  for (const line of lines) {
    if (!categories.some((item) => item.toLowerCase() === line.category.toLowerCase())) {
      categories = [...categories.filter((item) => item !== "Other"), line.category, "Other"];
    }
  }
}

function clean(input: ExpenseInput) {
  const lines = input.lines.map((line) => ({
    description: line.description.trim(),
    category: line.category.trim(),
    amount: round(line.amount),
  }));
  return {
    date: input.date,
    accountId: input.accountId,
    payee: input.payee.trim() || undefined,
    reference: input.reference.trim() || undefined,
    note: input.note.trim() || undefined,
    lines,
    total: totalOf(lines),
  };
}

export function addExpense(input: ExpenseInput): Expense {
  const expense: Expense = { id: `exp-${Date.now()}`, ...clean(input) };
  rememberCategories(expense.lines);
  expenses = [expense, ...expenses];
  return expense;
}

export function editExpense(id: string, input: ExpenseInput): void {
  const next = clean(input);
  rememberCategories(next.lines);
  expenses = expenses.map((expense) => (expense.id === id ? { id, ...next } : expense));
}

export function deleteExpense(id: string): void {
  expenses = expenses.filter((expense) => expense.id !== id);
}

/** The distinct categories a bill touches, in the order they first appear. */
export function categoriesOf(expense: Expense): string[] {
  return Array.from(new Set(expense.lines.map((line) => line.category)));
}

// ------------------------------------------------------ managing the categories

/** "Other" is the catch-all, so it always stays. */
export const CATCH_ALL_CATEGORY = "Other";

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Adds a category; returns an error message, or null. */
export function addExpenseCategory(name: string): string | null {
  const clean = name.trim();
  if (clean === "") return "Enter a name.";
  if (categories.some((item) => sameName(item, clean))) return "This category already exists.";
  categories = [
    ...categories.filter((item) => item !== CATCH_ALL_CATEGORY),
    clean,
    CATCH_ALL_CATEGORY,
  ];
  return null;
}

/** Renames a category everywhere it is used; returns an error message, or null. */
export function renameExpenseCategory(from: string, to: string): string | null {
  const clean = to.trim();
  if (from === CATCH_ALL_CATEGORY) return `"${CATCH_ALL_CATEGORY}" can't be renamed.`;
  if (clean === "") return "Enter a name.";
  if (categories.some((item) => item !== from && sameName(item, clean))) {
    return "This category already exists.";
  }
  categories = categories.map((item) => (item === from ? clean : item));
  expenses = expenses.map((expense) => ({
    ...expense,
    lines: expense.lines.map((line) =>
      line.category === from ? { ...line, category: clean } : line,
    ),
  }));
  return null;
}

export function deleteExpenseCategory(name: string): void {
  if (name === CATCH_ALL_CATEGORY) return;
  categories = categories.filter((item) => item !== name);
}

/** How a category is used: items, the bills they sit on, and what has been spent on it. */
export function categoryUsage(name: string): { items: number; bills: number; spent: number } {
  let items = 0;
  let spent = 0;
  const bills = new Set<string>();
  for (const expense of expenses) {
    for (const line of expense.lines) {
      if (line.category !== name) continue;
      items += 1;
      spent += line.amount;
      bills.add(expense.id);
    }
  }
  return { items, bills: bills.size, spent: round(spent) };
}
