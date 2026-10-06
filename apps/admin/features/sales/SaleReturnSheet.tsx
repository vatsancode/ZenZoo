"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Chips, DatePicker, Input, Select, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { PAYMENT_ACCOUNT_OPTIONS, PAYMENT_METHOD_OPTIONS } from "../../lib/payment-options";
import {
  nextReturnNumber,
  returnableOf,
  SALE_RETURN_REASONS,
  unitRefundOf,
  type Sale,
  type SaleLine,
  type SaleRefundMode,
  type SaleReturn,
} from "./sales";
import { today } from "../../lib/date-ranges";
import { formatPrice } from "../../lib/stock-display";
import FormField from "../../components/FormField";
import InfoTip from "../../components/InfoTip";
import QuantityPill from "../../components/QuantityPill";

interface SaleReturnSheetProps {
  open: boolean;
  sale: Sale;
  onClose: () => void;
  onConfirm: (ret: SaleReturn, picks: { line: SaleLine; quantity: number }[]) => void;
}

const number = (value: string) => (value.trim() === "" ? 0 : Number(value));
const money = (value: number) => Math.round(value * 100) / 100;

const REASON_OPTIONS = SALE_RETURN_REASONS.map((reason) => ({ value: reason, label: reason }));

const REFUND_HELP: Record<SaleRefundMode, string> = {
  money: "Pay the customer back now, by the method you choose.",
  credit: "Keep the amount as store credit on the customer's account for a future purchase.",
  none: "Nothing is paid back or credited. Use this for a straight swap handled as a new sale.",
};

// Where the money usually leaves from for each method; the cashier can still change it.
const DEFAULT_ACCOUNT: Record<string, string> = {
  CASH: "cash-drawer",
  UPI: "hdfc-current",
  CARD: "hdfc-current",
  BANK_TRANSFER: "hdfc-current",
};

/**
 * Takes goods back from a customer, in two steps in a side panel: what is coming
 * back, then why and how the customer is made whole.
 */
export default function SaleReturnSheet({ open, sale, onClose, onConfirm }: SaleReturnSheetProps) {
  const { colors, radius, spacing } = useTheme();
  const knownCustomer = Boolean(sale.customerId);
  const [step, setStep] = useState<1 | 2>(1);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<SaleRefundMode>("money");
  // Typed over the full value when the customer is refunded less; null means the full value.
  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) return;
    setStep(1);
    setQuantities({});
    setDate(today());
    setReason("");
    setNote("");
    setMode("money");
    setAmount(null);
    setMethod("");
    setAccountId("");
    setTouched(false);
  }, [open]);

  const lines = sale.lines.filter((line) => returnableOf(line) > 0);
  const picks = lines
    .map((line) => ({ line, quantity: number(quantities[line.sku] ?? "") }))
    .filter((entry) => entry.quantity > 0);
  const units = picks.reduce((sum, entry) => sum + entry.quantity, 0);
  const value = money(
    picks.reduce((sum, entry) => sum + entry.quantity * unitRefundOf(sale, entry.line), 0),
  );

  function problemWith(line: SaleLine): string | null {
    const typed = quantities[line.sku] ?? "";
    const quantity = number(typed);
    if (typed.trim() === "") return null;
    if (Number.isNaN(quantity) || quantity < 0) return "Enter a number.";
    if (!Number.isInteger(quantity)) return "Whole pieces only.";
    if (quantity > returnableOf(line)) return `Only ${returnableOf(line)} can come back.`;
    return null;
  }

  const stepOneReady = picks.length > 0 && !lines.some((line) => problemWith(line) !== null);

  const paid = mode === "none" ? 0 : amount === null ? value : number(amount);
  const problems = {
    reason: reason === "" ? "Choose a reason." : null,
    date: date === "" ? "Choose the return date." : null,
    amount:
      mode === "none"
        ? null
        : Number.isNaN(paid) || paid <= 0
          ? "Enter the amount."
          : paid > value
            ? `More than the ${formatPrice(value)} they paid.`
            : null,
    method: mode === "money" && method === "" ? "Choose a method." : null,
    account: mode === "money" && accountId === "" ? "Choose an account." : null,
  };
  const stepTwoReady = Object.values(problems).every((item) => item === null);

  function next() {
    setTouched(true);
    if (stepOneReady) {
      setStep(2);
      setTouched(false);
    }
  }

  function confirm() {
    setTouched(true);
    if (!stepTwoReady) return;
    onConfirm(
      {
        id: `sret-${Date.now()}`,
        number: nextReturnNumber(),
        date,
        reason,
        note: note.trim() || undefined,
        items: picks.map(({ line, quantity }) => ({
          sku: line.sku,
          name: line.name,
          unit: line.unit,
          quantity,
          unitRefund: unitRefundOf(sale, line),
        })),
        value,
        refund:
          mode === "money"
            ? { mode, amount: money(paid), method, accountId }
            : { mode, amount: money(paid) },
      },
      picks,
    );
  }

  const refundOptions: { value: SaleRefundMode; label: string }[] = [
    { value: "money", label: "Refund" },
    ...(knownCustomer ? [{ value: "credit" as const, label: "Store credit" }] : []),
    { value: "none", label: "No refund" },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Customer return"
      width={560}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
          <div style={{ ...textStyle("body"), color: colors.inkMuted }}>
            {picks.length === 0 ? (
              "Enter how many are coming back to continue."
            ) : (
              <>
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                  {units} {units === 1 ? "unit" : "units"}
                </span>
                {` across ${picks.length} ${picks.length === 1 ? "item" : "items"} · worth `}
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                  {formatPrice(value)}
                </span>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: spacing[3] }}>
            {step === 1 ? (
              <>
                <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={picks.length === 0}
                  onClick={next}
                  style={{ flex: 2 }}
                >
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(1)}
                  style={{ flex: 1 }}
                >
                  Back
                </Button>
                <Button type="button" variant="primary" onClick={confirm} style={{ flex: 2 }}>
                  Confirm return
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
          <div style={{ display: "flex", gap: spacing[2] }}>
            {[1, 2].map((n) => (
              <span
                key={n}
                aria-hidden="true"
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: radius.full,
                  backgroundColor: n <= step ? colors.accent : colors.border,
                }}
              />
            ))}
          </div>
          <div
            style={{
              ...textStyle("footnote"),
              color: colors.inkMuted,
              display: "flex",
              alignItems: "center",
              gap: spacing[2],
            }}
          >
            Step {step} of 2 · {step === 1 ? "What is coming back" : "Reason and refund"}
            {step === 1 ? (
              <InfoTip label="What can be returned">
                Enter how many of each item the customer is bringing <strong>back</strong>. Only
                items from this sale that have not already been returned can come back, and the
                goods go back into your stock.
              </InfoTip>
            ) : null}
          </div>
        </div>

        {step === 1 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                paddingBottom: spacing[3],
              }}
            >
              <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
                How many are coming back?
              </span>
              <button
                type="button"
                onClick={() =>
                  setQuantities(
                    Object.fromEntries(lines.map((line) => [line.sku, String(returnableOf(line))])),
                  )
                }
                style={{
                  ...textStyle("bodyMedium"),
                  border: "none",
                  background: "transparent",
                  color: colors.accent,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Return everything
              </button>
            </div>

            {lines.map((line, index) => {
              const can = returnableOf(line);
              const problem = problemWith(line);
              const quantity = number(quantities[line.sku] ?? "");
              const chosen = quantity > 0 && !problem;
              return (
                <div
                  key={line.sku}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing[4],
                    minHeight: 76,
                    padding: `${spacing[3]}px 0`,
                    borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{line.name}</div>
                    <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                      {line.sku}
                    </div>
                    <div
                      role={problem ? "alert" : undefined}
                      style={{
                        ...textStyle("footnote"),
                        marginTop: 2,
                        color: problem ? colors.danger : colors.inkMuted,
                      }}
                    >
                      {problem
                        ? problem
                        : chosen
                          ? `Worth ${formatPrice(money(quantity * unitRefundOf(sale, line)))}`
                          : line.returned
                            ? `${can} can come back · ${line.returned} already returned`
                            : `${can} of ${line.quantity} sold can come back`}
                    </div>
                  </div>
                  <QuantityPill
                    value={quantities[line.sku] ?? ""}
                    onChange={(nextValue) =>
                      setQuantities((current) => ({ ...current, [line.sku]: nextValue }))
                    }
                    max={can}
                    actionLabel="Return"
                    name={line.name}
                    invalid={Boolean(problem)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[8] }}>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
              <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>COMING BACK</div>
              {picks.map(({ line, quantity }) => (
                <div
                  key={line.sku}
                  style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}
                >
                  <span style={{ ...textStyle("body"), color: colors.ink }}>{line.name}</span>
                  <span style={{ ...textStyle("data"), color: colors.ink }}>
                    {quantity} {line.unit}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
              <div style={{ ...textStyle("headline"), color: colors.ink }}>Return details</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  columnGap: spacing[4],
                  rowGap: spacing[6],
                  alignItems: "start",
                }}
              >
                <FormField
                  id="sret-reason"
                  label="REASON"
                  span={1}
                  error={touched ? problems.reason : null}
                >
                  <Select
                    id="sret-reason"
                    options={REASON_OPTIONS}
                    value={reason}
                    placeholder="Why is it back?"
                    searchable={false}
                    aria-invalid={touched && problems.reason ? true : undefined}
                    onChange={setReason}
                  />
                </FormField>
                <FormField
                  id="sret-date"
                  label="RETURN DATE"
                  span={1}
                  error={touched ? problems.date : null}
                >
                  <DatePicker
                    id="sret-date"
                    value={date}
                    clearable={false}
                    align="right"
                    onChange={setDate}
                  />
                </FormField>
                <FormField id="sret-note" label="NOTE (OPTIONAL)" span={2}>
                  <Input
                    id="sret-note"
                    autoComplete="off"
                    placeholder="Anything worth remembering"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </FormField>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: spacing[6],
                paddingTop: spacing[8],
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}
              >
                <div style={{ ...textStyle("headline"), color: colors.ink }}>Make it right</div>
                <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
                  Worth{" "}
                  <span style={{ ...textStyle("data"), color: colors.ink }}>
                    {formatPrice(value)}
                  </span>
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
                <Chips
                  aria-label="How the customer is made whole"
                  options={refundOptions}
                  value={mode}
                  columns={refundOptions.length}
                  onChange={(next) => setMode(next as SaleRefundMode)}
                />
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  {REFUND_HELP[mode]}
                  {!knownCustomer
                    ? " Store credit needs a known customer, and this was a walk-in sale."
                    : ""}
                </div>
              </div>

              {mode !== "none" ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    columnGap: spacing[4],
                    rowGap: spacing[6],
                    alignItems: "start",
                  }}
                >
                  <FormField
                    id="sret-amount"
                    label={mode === "credit" ? "CREDIT AMOUNT (₹)" : "REFUND AMOUNT (₹)"}
                    span={mode === "money" ? 2 : 2}
                    error={touched ? problems.amount : null}
                  >
                    <Input
                      id="sret-amount"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={amount ?? String(value)}
                      aria-invalid={touched && problems.amount ? true : undefined}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </FormField>
                  {mode === "money" ? (
                    <>
                      <FormField
                        id="sret-method"
                        label="PAID BACK BY"
                        span={1}
                        error={touched ? problems.method : null}
                      >
                        <Select
                          id="sret-method"
                          options={PAYMENT_METHOD_OPTIONS}
                          value={method}
                          placeholder="Method"
                          searchable={false}
                          aria-invalid={touched && problems.method ? true : undefined}
                          onChange={(next) => {
                            setMethod(next);
                            setAccountId(DEFAULT_ACCOUNT[next] ?? "");
                          }}
                        />
                      </FormField>
                      <FormField
                        id="sret-account"
                        label="PAID FROM"
                        span={1}
                        error={touched ? problems.account : null}
                      >
                        <Select
                          id="sret-account"
                          options={PAYMENT_ACCOUNT_OPTIONS}
                          value={accountId}
                          placeholder="Account"
                          searchable={false}
                          aria-invalid={touched && problems.account ? true : undefined}
                          onChange={setAccountId}
                        />
                      </FormField>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
