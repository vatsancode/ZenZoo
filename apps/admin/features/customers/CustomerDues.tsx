"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, DatePicker, Input, Modal, Select, textStyle } from "@zenzoo/ui-web";
import { useState } from "react";
import { PAYMENT_ACCOUNT_OPTIONS, PAYMENT_METHOD_OPTIONS } from "../../lib/payment-options";
import { dueBalance, type DueEntry } from "../sales/sales";
import { formatDate, formatPrice } from "../../lib/stock-display";

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const DEFAULT_ACCOUNT: Record<string, string> = {
  CASH: "cash-drawer",
  UPI: "hdfc-current",
  CARD: "hdfc-current",
  BANK_TRANSFER: "hdfc-current",
};

export interface CollectInput {
  amount: number;
  method: string;
  accountId: string;
  date: string;
  note?: string;
}

/** What the customer owes on account: the balance, every credit sale and payment, and a way to collect. */
export default function CustomerDues({
  entries,
  onCollect,
}: {
  entries: DueEntry[];
  onCollect: (input: CollectInput) => void;
}) {
  const { colors, spacing } = useTheme();
  const owed = dueBalance(entries);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const value = amount.trim() === "" ? 0 : Number(amount);
  const problem = !(value > 0)
    ? "Enter the amount received."
    : value > owed
      ? `That is more than the ${formatPrice(owed)} owed.`
      : method === ""
        ? "Choose how they paid."
        : accountId === ""
          ? "Choose the account the money went into."
          : date === ""
            ? "Choose the date."
            : null;

  function openModal() {
    setAmount(String(owed));
    setMethod("");
    setAccountId("");
    setDate(today());
    setNote("");
    setShowErrors(false);
    setOpen(true);
  }

  function save() {
    if (problem) {
      setShowErrors(true);
      return;
    }
    onCollect({ amount: value, method, accountId, date, note: note.trim() || undefined });
    setOpen(false);
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing[4],
          marginBottom: spacing[5],
        }}
      >
        <div>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Dues</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            Sales left on account, less what has been paid since.
          </div>
        </div>
        {owed > 0 ? (
          <Button type="button" variant="primary" onClick={openModal}>
            Collect payment
          </Button>
        ) : null}
      </div>

      <div style={{ paddingBottom: spacing[6] }}>
        <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>OWES YOU</div>
        <div
          style={{
            ...textStyle("display"),
            color: owed > 0 ? colors.warning : colors.ink,
            marginTop: spacing[1],
          }}
        >
          {formatPrice(owed)}
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          Nothing has been sold on account to this customer.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.map((entry, index) => (
            <div
              key={`${entry.kind}-${entry.reference}`}
              style={{
                display: "grid",
                gridTemplateColumns: "96px minmax(0, 1fr) auto",
                columnGap: spacing[4],
                alignItems: "center",
                minHeight: 60,
                borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                {formatDate(entry.date)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...textStyle("body"), color: colors.ink }}>
                  {entry.kind === "credit_sale" ? `Sale ${entry.reference}` : "Payment received"}
                </div>
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  {entry.detail}
                </div>
              </div>
              <span
                style={{
                  ...textStyle("data"),
                  color: entry.amount > 0 ? colors.warning : colors.success,
                }}
              >
                {entry.amount > 0 ? "+" : "-"} {formatPrice(Math.abs(entry.amount))}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Collect payment</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            {formatPrice(owed)} is owed. A part payment is fine.
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[4],
              marginTop: spacing[5],
            }}
          >
            <Input
              inputMode="decimal"
              autoComplete="off"
              aria-label="Amount received"
              placeholder="Amount received"
              value={amount}
              aria-invalid={showErrors && !(value > 0 && value <= owed) ? true : undefined}
              onChange={(event) => {
                if (/^\d*\.?\d*$/.test(event.target.value)) setAmount(event.target.value);
              }}
            />
            <Select
              options={PAYMENT_METHOD_OPTIONS}
              value={method}
              placeholder="How they paid"
              searchable={false}
              aria-label="Payment method"
              aria-invalid={showErrors && method === "" ? true : undefined}
              onChange={(next) => {
                setMethod(next);
                setAccountId(DEFAULT_ACCOUNT[next] ?? "");
              }}
            />
            <Select
              options={PAYMENT_ACCOUNT_OPTIONS}
              value={accountId}
              placeholder="Received into"
              searchable={false}
              aria-label="Received into account"
              aria-invalid={showErrors && accountId === "" ? true : undefined}
              onChange={setAccountId}
            />
            <DatePicker aria-label="Payment date" value={date} onChange={setDate} />
            <Input
              autoComplete="off"
              aria-label="Note"
              placeholder="Note (optional)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[4],
              marginTop: spacing[6],
            }}
          >
            <span style={{ ...textStyle("footnote"), color: colors.danger }}>
              {showErrors && problem ? problem : ""}
            </span>
            <div style={{ display: "flex", gap: spacing[3] }}>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={save}>
                Record payment
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
