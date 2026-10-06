"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, DatePicker, IconButton, Input, Modal, Select, textStyle } from "@zenzoo/ui-web";
import type { ReactNode } from "react";
import { PAYMENT_ACCOUNT_OPTIONS, PAYMENT_METHOD_OPTIONS } from "../../lib/payment-options";

/** A payment as typed: the amount stays a string until it is saved. */
export interface PayRow {
  amount: string;
  method: string;
  accountId: string;
  date: string;
}

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function newPayRow(): PayRow {
  return { amount: "", method: "", accountId: "", date: today() };
}

const amountOf = (row: PayRow) => (row.amount.trim() === "" ? 0 : Number(row.amount));

/** Rows that carry an amount; the rest are ignored. */
export function countedRows(rows: PayRow[]): PayRow[] {
  return rows.filter((row) => amountOf(row) > 0);
}

export function rowsTotal(rows: PayRow[]): number {
  return Math.round(rows.reduce((sum, row) => sum + (amountOf(row) || 0), 0) * 100) / 100;
}

/** What is missing on rows that have an amount. */
export function payRowProblems(rows: PayRow[]): string[] {
  const problems: string[] = [];
  rows.forEach((row, index) => {
    if (!(amountOf(row) > 0)) return;
    const label = rows.length > 1 ? ` for payment ${index + 1}` : "";
    if (row.method === "") problems.push(`Choose how it was paid${label}.`);
    if (row.accountId === "") problems.push(`Choose the account${label}.`);
    if (row.date === "") problems.push(`Choose the payment date${label}.`);
  });
  return problems;
}

interface PaymentsModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle: string;
  rows: PayRow[];
  onRowsChange: (rows: PayRow[]) => void;
  /** Show the red marks on rows with something missing. */
  showErrors: boolean;
  /** Left of the footer: a short line of totals or an error. */
  footerNote: ReactNode;
  doneLabel: string;
  onDone: () => void;
}

// More rows than this and the list scrolls inside the popup instead of growing it.
const SCROLL_AFTER = 4;

// Columns of a payment row: amount, method, account, date, remove.
const COLUMNS = "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr) 36px";

/**
 * The payment entry popup: one row per payment (amount, method, account, date)
 * with "+ Add another payment". Shared by the new purchase page and the
 * Record payment action on an existing purchase, so both look and work alike.
 */
export default function PaymentsModal({
  open,
  onClose,
  title = "Payment",
  subtitle,
  rows,
  onRowsChange,
  showErrors,
  footerNote,
  doneLabel,
  onDone,
}: PaymentsModalProps) {
  const { colors, spacing } = useTheme();

  function update(index: number, patch: Partial<PayRow>) {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ width: 820, maxWidth: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: spacing[4],
          }}
        >
          <div>
            <div style={{ ...textStyle("title3"), color: colors.ink }}>{title}</div>
            <div
              style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}
            >
              {subtitle}
            </div>
          </div>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div
          style={{
            marginTop: spacing[6],
            display: "flex",
            flexDirection: "column",
            gap: spacing[3],
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: COLUMNS,
              columnGap: spacing[3],
              ...textStyle("caption"),
              color: colors.inkMuted,
            }}
          >
            <span>AMOUNT (₹)</span>
            <span>METHOD</span>
            <span>FROM ACCOUNT</span>
            <span>DATE</span>
            <span />
          </div>
          {/* Past a few rows the list scrolls on its own, so the heading and the buttons stay put. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[3],
              ...(rows.length > SCROLL_AFTER
                ? {
                    maxHeight: SCROLL_AFTER * 56,
                    overflowY: "auto",
                    scrollbarWidth: "thin",
                    scrollbarColor: `${colors.border} transparent`,
                    paddingRight: spacing[1],
                  }
                : {}),
            }}
          >
            {rows.map((row, index) => {
              const counted = amountOf(row) > 0;
              const bad = (missing: boolean) =>
                showErrors && counted && missing ? true : undefined;
              return (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: COLUMNS,
                    columnGap: spacing[3],
                    alignItems: "center",
                  }}
                >
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    autoFocus={index === rows.length - 1 && row.amount === ""}
                    placeholder="0.00"
                    aria-label={`Payment ${index + 1} amount`}
                    value={row.amount}
                    onChange={(event) => update(index, { amount: event.target.value })}
                  />
                  <Select
                    options={PAYMENT_METHOD_OPTIONS}
                    value={row.method}
                    placeholder="Method"
                    searchable={false}
                    aria-label={`Payment ${index + 1} method`}
                    aria-invalid={bad(row.method === "")}
                    onChange={(next) => update(index, { method: next })}
                  />
                  <Select
                    options={PAYMENT_ACCOUNT_OPTIONS}
                    value={row.accountId}
                    placeholder="Account"
                    searchable={false}
                    aria-label={`Payment ${index + 1} account`}
                    aria-invalid={bad(row.accountId === "")}
                    onChange={(next) => update(index, { accountId: next })}
                  />
                  <DatePicker
                    align="right"
                    aria-label={`Payment ${index + 1} date`}
                    aria-invalid={bad(row.date === "")}
                    value={row.date}
                    onChange={(next) => update(index, { date: next })}
                  />
                  {rows.length > 1 ? (
                    <IconButton
                      icon="close"
                      label={`Remove payment ${index + 1}`}
                      onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
                    />
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onRowsChange([...rows, newPayRow()])}
              style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
            >
              + Add another payment
            </Button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: spacing[4],
            marginTop: spacing[6],
          }}
        >
          <span style={{ ...textStyle("body"), color: colors.inkMuted }}>{footerNote}</span>
          <Button type="button" variant="primary" onClick={onDone}>
            {doneLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
