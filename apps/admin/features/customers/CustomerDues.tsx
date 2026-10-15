"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Input, Modal, Select, textStyle } from "@zenzoo/ui-web";
import { useState } from "react";
import type { TillPaymentOptions } from "../../lib/till";
import type { DueEntry } from "../sales/sales";
import { formatDate, formatPrice } from "../../lib/stock-display";

export interface CollectInput {
  amount: number;
  /** Real ids, from the server's payment options. */
  methodId: string;
  accountId: string;
  note?: string;
}

/** What the customer owes on account: the balance, every credit sale and payment, and a way to collect. */
export default function CustomerDues({
  entries,
  owed,
  options,
  onCollect,
}: {
  entries: DueEntry[];
  /** What they owe, from the server's ledger balance. */
  owed: number;
  /** The active methods and accounts a payment can come in by; null while loading. */
  options: TillPaymentOptions | null;
  /** Saves the payment; resolves to an error message to show, or null when it went through. */
  onCollect: (input: CollectInput) => Promise<string | null>;
}) {
  const { colors, spacing } = useTheme();
  const methods = options?.methods ?? [];
  const accounts = options?.accounts ?? [];
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const value = amount.trim() === "" ? 0 : Number(amount);
  const problem = !(value > 0)
    ? "Enter the amount received."
    : value > owed
      ? `That is more than the ${formatPrice(owed)} owed.`
      : method === ""
        ? "Choose how they paid."
        : accountId === ""
          ? "Choose the account the money went into."
          : null;

  function openModal() {
    setAmount(String(owed));
    setMethod("");
    setAccountId("");
    setNote("");
    setShowErrors(false);
    setServerError(null);
    setOpen(true);
  }

  async function save() {
    if (problem) {
      setShowErrors(true);
      return;
    }
    if (saving) return;
    setSaving(true);
    setServerError(null);
    const failure = await onCollect({
      amount: value,
      methodId: method,
      accountId,
      note: note.trim() || undefined,
    });
    setSaving(false);
    if (failure) setServerError(failure);
    else setOpen(false);
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
              options={methods.map((item) => ({ value: item.id, label: item.name }))}
              value={method}
              placeholder="How they paid"
              searchable={false}
              aria-label="Payment method"
              aria-invalid={showErrors && method === "" ? true : undefined}
              onChange={(next) => {
                setMethod(next);
                // A sensible place for the money: the cash drawer for cash, else the first account.
                const code = methods.find((item) => item.id === next)?.code;
                setAccountId(
                  (code === "CASH"
                    ? accounts.find((account) => /cash|drawer/i.test(account.name))
                    : undefined
                  )?.id ??
                    accounts[0]?.id ??
                    "",
                );
              }}
            />
            <Select
              options={accounts.map((item) => ({ value: item.id, label: item.name }))}
              value={accountId}
              placeholder="Received into"
              searchable={false}
              aria-label="Received into account"
              aria-invalid={showErrors && accountId === "" ? true : undefined}
              onChange={setAccountId}
            />
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
              {serverError ?? (showErrors && problem ? problem : "")}
            </span>
            <div style={{ display: "flex", gap: spacing[3] }}>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving..." : "Record payment"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
