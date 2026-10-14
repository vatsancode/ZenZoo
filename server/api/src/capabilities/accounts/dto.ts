export interface AccountDto {
  id: string;
  name: string;
  code: string;
  status: "active" | "disabled";
  openingBalance: string;
  balance: string;
}

interface AccountRow {
  id: string;
  name: string;
  code: string;
  status: string;
  opening_balance: { toString(): string };
  balance: { toString(): string };
}

export function toAccountDto(row: AccountRow): AccountDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status === "disabled" ? "disabled" : "active",
    openingBalance: row.opening_balance.toString(),
    balance: row.balance.toString(),
  };
}

export const ACCOUNT_SELECT = {
  id: true,
  name: true,
  code: true,
  status: true,
  opening_balance: true,
  balance: true,
} as const;

export interface TransferDto {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
  note: string | null;
}

interface TransferRow {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: { toString(): string };
  transfer_date: Date;
  note: string | null;
}

export function toTransferDto(row: TransferRow): TransferDto {
  return {
    id: row.id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amount: row.amount.toString(),
    date: row.transfer_date.toISOString().slice(0, 10),
    note: row.note,
  };
}

export const TRANSFER_SELECT = {
  id: true,
  from_account_id: true,
  to_account_id: true,
  amount: true,
  transfer_date: true,
  note: true,
} as const;
