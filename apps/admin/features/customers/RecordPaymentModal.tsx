"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Checkbox, Input, Modal, Select, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import type { TillPaymentOptions } from "../../lib/till";
import { formatPrice } from "../../lib/stock-display";

export interface CollectInput {
  amount: number;
  /** Real ids, from the server's payment options. */
  methodId: string;
  accountId: string;
  note?: string;
  /** The customer ticked that anything over what they owe is to be kept as store credit. */
  keepExtraAsCredit?: boolean;
}

const money = (value: number) => Math.round(value * 100) / 100;

/**
 * Records money received from a customer, whether or not they owe anything: it pays down what they
 * owe, and anything beyond that is kept as store credit (an advance) - but only when the person
 * ticks the box, so a mistyped amount can't quietly become credit.
 */
export default function RecordPaymentModal({
  open,
  onClose,
  customerName,
  owed,
  options,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  customerName: string;
  /** What they owe now, in rupees (0 when they owe nothing or hold credit). */
  owed: number;
  /** The active methods and accounts a payment can come in by; null while loading. */
  options: TillPaymentOptions | null;
  /** Saves the payment; resolves to an error message to show, or null when it went through. */
  onSave: (input: CollectInput) => Promise<string | null>;
}) {
  const { colors, spacing } = useTheme();
  const methods = options?.methods ?? [];
  const accounts = options?.accounts ?? [];
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [keepExtra, setKeepExtra] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Each time it opens, start fresh: the full amount owed (if any) is the natural thing to receive.
  useEffect(() => {
    if (!open) return;
    setAmount(owed > 0 ? String(owed) : "");
    setMethod("");
    setAccountId("");
    setNote("");
    setKeepExtra(false);
    setShowErrors(false);
    setSaving(false);
    setServerError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = amount.trim() === "" ? 0 : Number(amount);
  const extra = value > 0 ? money(Math.max(value - owed, 0)) : 0;
  const problem = !(value > 0)
    ? "Enter the amount received."
    : method === ""
      ? "Choose how they paid."
      : accountId === ""
        ? "Choose the account the money went into."
        : extra > 0 && !keepExtra
          ? owed > 0
            ? "Tick the box to keep the extra as store credit, or enter less."
            : "Tick the box to keep this as store credit."
          : null;

  async function save() {
    if (problem) {
      setShowErrors(true);
      return;
    }
    if (saving) return;
    setSaving(true);
    setServerError(null);
    const failure = await onSave({
      amount: value,
      methodId: method,
      accountId,
      note: note.trim() || undefined,
      keepExtraAsCredit: extra > 0 ? true : undefined,
    });
    setSaving(false);
    if (failure) setServerError(failure);
  }

  return (
    <Modal open={open} onClose={() => (saving ? undefined : onClose())}>
      <div style={{ width: 440, maxWidth: "100%" }}>
        <div style={{ ...textStyle("title3"), color: colors.ink }}>Record payment</div>
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
          {owed > 0
            ? `${customerName} owes ${formatPrice(owed)}. A part payment is fine.`
            : `${customerName} doesn't owe anything, so a payment now is kept as store credit.`}
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
            autoFocus
            aria-label="Amount received"
            placeholder="Amount received"
            value={amount}
            aria-invalid={showErrors && !(value > 0) ? true : undefined}
            onChange={(event) => {
              if (/^\d*\.?\d*$/.test(event.target.value)) {
                setAmount(event.target.value);
                setKeepExtra(false);
              }
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

          {extra > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: spacing[3],
                padding: spacing[4],
                backgroundColor: colors.surfaceSunken,
                borderRadius: 8,
              }}
            >
              <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {owed > 0
                  ? `${formatPrice(extra)} of this is more than they owe.`
                  : "They don't owe anything right now."}
              </div>
              <Checkbox
                checked={keepExtra}
                onChange={setKeepExtra}
                label={
                  owed > 0
                    ? `Keep the extra ${formatPrice(extra)} as store credit`
                    : `Keep all ${formatPrice(extra)} as store credit (an advance)`
                }
              />
            </div>
          ) : null}
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
            <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving..." : "Record payment"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
