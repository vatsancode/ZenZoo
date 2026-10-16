/**
 * Everything that has happened between a customer and the shop's money, one line each:
 *
 * - account entries (CREDIT_*) - rows of the append-only customer ledger. They move the customer's
 *   balance (what they owe, or the store credit they hold).
 * - money entries - cash actually received or paid out. They never move the balance: a sale paid in
 *   full at the till (SALE_PAYMENT), a refund paid back (RETURN_REFUND), and the payments handed back
 *   when a sale is cancelled (PAYMENT_RETURNED).
 */
export type StatementEntryType =
  | "CREDIT_SALE"
  | "CREDIT_PAYMENT"
  | "CREDIT_ADJUSTMENT"
  | "CREDIT_REVERSAL"
  | "SALE_PAYMENT"
  | "RETURN_REFUND"
  | "PAYMENT_RETURNED";

export interface CustomerStatementEntryDto {
  id: string;
  createdAt: string;
  type: StatementEntryType;
  /**
   * What it did to the customer's balance, signed, in rupees: above 0 is a debit (they owe the shop
   * more), below 0 a credit (they owe less, or hold store credit) - "150.00" / "-81.00". Always
   * "0.00" for a money entry.
   */
  amount: string;
  /**
   * Cash that actually moved, signed: above 0 was received from the customer, below 0 was paid back
   * to them - "500.00" / "-81.00". null when no cash moved (pay later, store credit, adjustments).
   * A payment received on the account is both: a credit entry and cash in.
   */
  money: string | null;
  /** What they owed (above 0) or held as store credit (below 0) right after this entry. */
  balance: string;
  saleId: string | null;
  /** The receipt number of the sale behind the entry. */
  saleNumber: string | null;
  /** The credit slip number, for entries that came from a return. */
  returnNumber: string | null;
  /**
   * For an entry that put a sale on the account: STORE_CREDIT (credit spent) or ON_ACCOUNT (pay
   * later). For money: how it was paid (CASH, UPI...).
   */
  methodCode: string | null;
  methodName: string | null;
  /** The account the money went into, or came out of. */
  accountName: string | null;
  reference: string | null;
  note: string | null;
  /** Who entered it. */
  enteredBy: string;
}

interface Money {
  toFixed(decimalPlaces: number): string;
}

type Person = { first_name: string; last_name: string | null };
const nameOf = (user: Person) => [user.first_name, user.last_name].filter(Boolean).join(" ");
const paise = (value: Money) => Math.round(Number(value.toFixed(2)) * 100);

// ---------------------------------------------------------------- the rows each part reads

export interface LedgerStatementRow {
  id: string;
  created_at: Date;
  entry_type: string;
  amount: Money;
  sale_id: string | null;
  sale_return_id: string | null;
  payment_method_id: string | null;
  payment_account_id: string | null;
  reference: string | null;
  notes: string | null;
  sales: { sale_number: string | null } | null;
  sale_payments: { payment_methods: { code: string; name: string } } | null;
  users: Person;
}

export const LEDGER_SELECT = {
  id: true,
  created_at: true,
  entry_type: true,
  amount: true,
  sale_id: true,
  sale_return_id: true,
  payment_method_id: true,
  payment_account_id: true,
  reference: true,
  notes: true,
  sales: { select: { sale_number: true } },
  sale_payments: { select: { payment_methods: { select: { code: true, name: true } } } },
  users: { select: { first_name: true, last_name: true } },
} as const;

/** A payment taken at the till into a real account (customer-credit payments name no account). */
export interface PaymentStatementRow {
  id: string;
  created_at: Date;
  amount: Money;
  sale_id: string;
  reference: string | null;
  payment_methods: { code: string; name: string };
  payment_accounts: { name: string } | null;
  users: Person;
  sales: { sale_number: string | null; status: string; updated_at: Date };
}

export const PAYMENT_STATEMENT_SELECT = {
  id: true,
  created_at: true,
  amount: true,
  sale_id: true,
  reference: true,
  payment_methods: { select: { code: true, name: true } },
  payment_accounts: { select: { name: true } },
  users: { select: { first_name: true, last_name: true } },
  sales: { select: { sale_number: true, status: true, updated_at: true } },
} as const;

/** A return refunded in money. */
export interface RefundStatementRow {
  id: string;
  created_at: Date;
  refund_amount: Money;
  sale_id: string;
  return_number: string | null;
  payment_methods: { code: string; name: string } | null;
  payment_accounts: { name: string } | null;
  users: Person;
  sales: { sale_number: string | null };
}

export const REFUND_STATEMENT_SELECT = {
  id: true,
  created_at: true,
  refund_amount: true,
  sale_id: true,
  return_number: true,
  payment_methods: { select: { code: true, name: true } },
  payment_accounts: { select: { name: true } },
  users: { select: { first_name: true, last_name: true } },
  sales: { select: { sale_number: true } },
} as const;

// ---------------------------------------------------------------- putting it together

const LEDGER_TYPES = [
  "CREDIT_SALE",
  "CREDIT_PAYMENT",
  "CREDIT_ADJUSTMENT",
  "CREDIT_REVERSAL",
] as const;

type Pending = Omit<CustomerStatementEntryDto, "balance" | "amount" | "money"> & {
  at: Date;
  /** Breaks a tie between entries made in the same instant: money in, then the account, then money out. */
  rank: number;
  /** Effect on the balance, in paise. */
  delta: number;
  /** Cash moved, in paise (signed), or null. */
  cash: number | null;
};

export interface StatementLookups {
  returnNumbers: Map<string, string | null>;
  methods: Map<string, { code: string; name: string }>;
  accounts: Map<string, { name: string }>;
}

/**
 * Merges the ledger and the money entries into one timeline, oldest first, and works out the balance
 * after each line from the ledger entries alone - in whole paise, never from a stored number.
 */
export function buildStatement(
  ledger: LedgerStatementRow[],
  payments: PaymentStatementRow[],
  refunds: RefundStatementRow[],
  lookups: StatementLookups,
): CustomerStatementEntryDto[] {
  const pending: Pending[] = [];

  for (const row of ledger) {
    const method =
      row.sale_payments?.payment_methods ??
      (row.payment_method_id ? lookups.methods.get(row.payment_method_id) : undefined);
    pending.push({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      at: row.created_at,
      rank: 1,
      type: (LEDGER_TYPES as readonly string[]).includes(row.entry_type)
        ? (row.entry_type as StatementEntryType)
        : "CREDIT_ADJUSTMENT",
      delta: paise(row.amount),
      // A payment received from the customer is cash coming in.
      cash: row.entry_type === "CREDIT_PAYMENT" ? -paise(row.amount) : null,
      saleId: row.sale_id,
      saleNumber: row.sales?.sale_number ?? null,
      returnNumber: row.sale_return_id
        ? (lookups.returnNumbers.get(row.sale_return_id) ?? null)
        : null,
      methodCode: method?.code ?? null,
      methodName: method?.name ?? null,
      accountName: row.payment_account_id
        ? (lookups.accounts.get(row.payment_account_id)?.name ?? null)
        : null,
      reference: row.reference,
      note: row.notes,
      enteredBy: nameOf(row.users),
    });
  }

  for (const row of payments) {
    const base = {
      saleId: row.sale_id,
      saleNumber: row.sales.sale_number,
      returnNumber: null,
      methodCode: row.payment_methods.code,
      methodName: row.payment_methods.name,
      accountName: row.payment_accounts?.name ?? null,
      reference: row.reference,
      note: null,
      enteredBy: nameOf(row.users),
      delta: 0,
    };
    pending.push({
      ...base,
      id: `pay-${row.id}`,
      createdAt: row.created_at.toISOString(),
      at: row.created_at,
      rank: 0,
      type: "SALE_PAYMENT",
      cash: paise(row.amount),
    });
    // A cancelled sale gives the money back - a new line, never a change to the one above.
    if (row.sales.status === "voided") {
      pending.push({
        ...base,
        id: `void-${row.id}`,
        createdAt: row.sales.updated_at.toISOString(),
        at: row.sales.updated_at,
        rank: 2,
        type: "PAYMENT_RETURNED",
        cash: -paise(row.amount),
      });
    }
  }

  for (const row of refunds) {
    pending.push({
      id: `refund-${row.id}`,
      createdAt: row.created_at.toISOString(),
      at: row.created_at,
      rank: 2,
      type: "RETURN_REFUND",
      delta: 0,
      cash: -paise(row.refund_amount),
      saleId: row.sale_id,
      saleNumber: row.sales.sale_number,
      returnNumber: row.return_number,
      methodCode: row.payment_methods?.code ?? null,
      methodName: row.payment_methods?.name ?? null,
      accountName: row.payment_accounts?.name ?? null,
      reference: null,
      note: null,
      enteredBy: nameOf(row.users),
    });
  }

  pending.sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.rank - b.rank || a.id.localeCompare(b.id),
  );

  let balance = 0;
  return pending.map(({ at: _at, rank: _rank, delta, cash, ...entry }) => {
    balance += delta;
    return {
      ...entry,
      amount: (delta / 100).toFixed(2),
      money: cash === null ? null : (cash / 100).toFixed(2),
      balance: (balance / 100).toFixed(2),
    };
  });
}
