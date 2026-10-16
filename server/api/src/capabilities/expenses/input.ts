export interface ExpenseLineInput {
  description?: string;
  categoryId: string;
  amount: number;
}

export interface ExpenseInput {
  /** The bill's date, YYYY-MM-DD. */
  date: string;
  payee?: string;
  reference?: string;
  note?: string;
  status: "pending" | "paid";
  /** Pending bills only: when it falls due. */
  dueDate?: string;
  /** Paid bills only. */
  accountId?: string;
  paidDate?: string;
  lines: ExpenseLineInput[];
}

export interface CleanExpense {
  date: Date;
  payee: string | null;
  reference: string | null;
  note: string | null;
  status: "pending" | "paid";
  dueDate: Date | null;
  paidDate: Date | null;
  accountId: string | null;
  total: number;
  lines: { description: string; categoryId: string; amount: number }[];
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const round = (value: number) => Math.round(value * 100) / 100;

function toDay(value: string | undefined, message: string): Date | null {
  if (value === undefined || value === "") return null;
  if (!ISO_DAY.test(value) || Number.isNaN(new Date(value).getTime())) throw new Error(message);
  return new Date(value);
}

/** The rules every saved bill follows, as friendly sentences. The database repeats them as constraints. */
export function cleanExpense(input: ExpenseInput): CleanExpense {
  const date = toDay(input.date, "Choose the date.");
  if (!date) throw new Error("Choose the date.");

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("Add at least one item.");
  }
  const lines = input.lines.map((line) => {
    const amount = round(Number(line.amount));
    if (!line.categoryId) throw new Error("Every item needs a category.");
    if (!(amount > 0)) throw new Error("Every item needs an amount more than zero.");
    return { description: (line.description ?? "").trim(), categoryId: line.categoryId, amount };
  });
  const total = round(lines.reduce((sum, line) => sum + line.amount, 0));

  if (input.status !== "paid" && input.status !== "pending") {
    throw new Error("Choose paid or pending.");
  }

  let paidDate: Date | null = null;
  let accountId: string | null = null;
  let dueDate: Date | null = null;
  if (input.status === "paid") {
    if (!input.accountId) throw new Error("Choose the account it was paid from.");
    accountId = input.accountId;
    paidDate = toDay(input.paidDate, "Choose the date it was paid.") ?? date;
  } else {
    dueDate = toDay(input.dueDate, "Choose a valid due date.");
  }

  return {
    date,
    payee: input.payee?.trim() || null,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
    status: input.status,
    dueDate,
    paidDate,
    accountId,
    total,
    lines,
  };
}

/** The database's own rejections, as sentences. */
export function friendlyExpenseError(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  if (/not enough balance/i.test(message)) {
    return new Error("That account doesn't have enough balance to pay this bill.");
  }
  if (/expense_lines_category_fk/i.test(message)) {
    return new Error("One of the categories doesn't exist.");
  }
  if (/expenses_account_fk/i.test(message)) {
    return new Error("That account doesn't exist.");
  }
  return error instanceof Error ? error : new Error("Something went wrong.");
}
