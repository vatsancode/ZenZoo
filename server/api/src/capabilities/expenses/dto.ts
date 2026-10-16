export interface ExpenseLineDto {
  description: string;
  categoryId: string;
  category: string;
  amount: string;
}

export interface ExpenseDto {
  id: string;
  storeId: string;
  /** The bill's date, YYYY-MM-DD. */
  date: string;
  payee: string | null;
  reference: string | null;
  note: string | null;
  /** 'pending' = received, to be paid later; 'paid' = money has left an account. */
  status: "pending" | "paid";
  /** When a pending bill is due, if the bill says. */
  dueDate: string | null;
  paidDate: string | null;
  /** The account it was paid from; null while pending. */
  accountId: string | null;
  total: string;
  lines: ExpenseLineDto[];
}

interface ExpenseRow {
  id: string;
  store_id: string;
  expense_date: Date;
  payee: string | null;
  reference: string | null;
  note: string | null;
  status: string;
  due_date: Date | null;
  paid_date: Date | null;
  payment_account_id: string | null;
  total: { toString(): string };
  expense_lines: {
    description: string;
    expense_category_id: string;
    amount: { toString(): string };
    expense_categories: { name: string };
  }[];
}

const day = (value: Date) => value.toISOString().slice(0, 10);

export function toExpenseDto(row: ExpenseRow): ExpenseDto {
  return {
    id: row.id,
    storeId: row.store_id,
    date: day(row.expense_date),
    payee: row.payee,
    reference: row.reference,
    note: row.note,
    status: row.status === "pending" ? "pending" : "paid",
    dueDate: row.due_date ? day(row.due_date) : null,
    paidDate: row.paid_date ? day(row.paid_date) : null,
    accountId: row.payment_account_id,
    total: row.total.toString(),
    lines: row.expense_lines.map((line) => ({
      description: line.description,
      categoryId: line.expense_category_id,
      category: line.expense_categories.name,
      amount: line.amount.toString(),
    })),
  };
}

export const EXPENSE_SELECT = {
  id: true,
  store_id: true,
  expense_date: true,
  payee: true,
  reference: true,
  note: true,
  status: true,
  due_date: true,
  paid_date: true,
  payment_account_id: true,
  total: true,
  expense_lines: {
    orderBy: { position: "asc" },
    select: {
      description: true,
      expense_category_id: true,
      amount: true,
      expense_categories: { select: { name: true } },
    },
  },
} as const;
