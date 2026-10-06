"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Chips, DatePicker, Input, Select, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { today } from "../lib/date-ranges";
import { PAYMENT_ACCOUNT_OPTIONS, PAYMENT_METHOD_OPTIONS } from "../lib/payment-options";
import {
  RETURN_REASONS,
  returnableOf,
  unitCredit,
  type Purchase,
  type PurchaseItem,
  type PurchaseReturn,
  type RefundMode,
} from "../features/purchases/purchases";
import { formatPrice } from "../lib/stock-display";
import FormField from "./FormField";
import InfoTip from "./InfoTip";
import QuantityPill from "./QuantityPill";

interface ReturnSheetProps {
  open: boolean;
  purchase: Purchase;
  onClose: () => void;
  onConfirm: (ret: PurchaseReturn, picks: { item: PurchaseItem; quantity: number }[]) => void;
}

const number = (value: string) => (value.trim() === "" ? 0 : Number(value));
const money = (value: number) => Math.round(value * 100) / 100;

const REASON_OPTIONS = RETURN_REASONS.map((reason) => ({ value: reason, label: reason }));

const REFUND_OPTIONS: { value: RefundMode; label: string; help: string }[] = [
  {
    value: "pending",
    label: "Pending",
    help: "The vendor will pay this back. You can mark it received later.",
  },
  {
    value: "refunded",
    label: "Received",
    help: "The vendor has already paid this back to you.",
  },
  {
    value: "adjusted",
    label: "Adjust against dues",
    help: "The credit is taken off what you owe this vendor. No money changes hands.",
  },
];

/**
 * Sends goods back to the vendor, in two steps in the same side panel as
 * Receive stock: first what and how many, then why and how the money is handled.
 */
export default function ReturnSheet({ open, purchase, onClose, onConfirm }: ReturnSheetProps) {
  const { colors, radius, spacing } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<RefundMode>("pending");
  const [method, setMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [refundDate, setRefundDate] = useState(today());
  // Typed over the credit when the vendor refunds only part; null means the full credit.
  const [refundAmount, setRefundAmount] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) return;
    setStep(1);
    setQuantities({});
    setDate(today());
    setReason("");
    setNote("");
    setMode("pending");
    setMethod("");
    setAccountId("");
    setRefundDate(today());
    setRefundAmount(null);
    setTouched(false);
  }, [open]);

  const lines = (purchase.items ?? []).filter((item) => returnableOf(item) > 0);
  const picks = lines
    .map((item) => ({ item, quantity: number(quantities[item.sku] ?? "") }))
    .filter((entry) => entry.quantity > 0);
  const units = picks.reduce((sum, entry) => sum + entry.quantity, 0);
  const credit = money(
    picks.reduce((sum, entry) => sum + entry.quantity * unitCredit(entry.item), 0),
  );

  function problemWith(item: PurchaseItem): string | null {
    const typed = quantities[item.sku] ?? "";
    const quantity = number(typed);
    if (typed.trim() === "") return null;
    if (Number.isNaN(quantity) || quantity < 0) return "Enter a number.";
    if (item.unit === "pcs" && !Number.isInteger(quantity)) return "Pieces must be a whole number.";
    if (quantity > returnableOf(item))
      return `Only ${returnableOf(item)} ${item.unit} can go back.`;
    return null;
  }

  const stepOneReady = picks.length > 0 && !lines.some((item) => problemWith(item) !== null);

  const refundValue = refundAmount === null ? credit : number(refundAmount);
  const detailProblems = {
    amount:
      mode !== "refunded"
        ? null
        : Number.isNaN(refundValue) || refundValue <= 0
          ? "Enter the amount."
          : refundValue > credit
            ? `More than the ${formatPrice(credit)} credit.`
            : null,
    reason: reason === "" ? "Choose a reason." : null,
    date: date === "" ? "Choose the return date." : null,
    method: mode === "refunded" && method === "" ? "Choose a method." : null,
    account: mode === "refunded" && accountId === "" ? "Choose an account." : null,
    refundDate: mode === "refunded" && refundDate === "" ? "Choose the date." : null,
  };
  const stepTwoReady = Object.values(detailProblems).every((value) => value === null);

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
        id: `ret-${Date.now()}`,
        date,
        reason,
        note: note.trim() || undefined,
        items: picks.map(({ item, quantity }) => ({
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          quantity,
          unitCredit: unitCredit(item),
        })),
        credit,
        refund:
          mode === "refunded"
            ? { mode, amount: money(refundValue), method, accountId, date: refundDate }
            : { mode, amount: credit },
      },
      picks,
    );
  }

  const refundHelp = REFUND_OPTIONS.find((option) => option.value === mode)?.help;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Return items"
      width={560}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
          <div style={{ ...textStyle("body"), color: colors.inkMuted }}>
            {picks.length === 0 ? (
              "Enter how many to return to continue."
            ) : (
              <>
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                  {units} {units === 1 ? "unit" : "units"}
                </span>
                {` across ${picks.length} ${picks.length === 1 ? "product" : "products"} · credit `}
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                  {formatPrice(credit)}
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
        {/* Two thin bars say where you are; the label says what this step is for. */}
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
              position: "relative",
            }}
          >
            Step {step} of 2 · {step === 1 ? "Choose what goes back" : "Reason and refund"}
            {step === 1 ? (
              <InfoTip label="What can be returned">
                Enter how many of each product you are <strong>sending back</strong>. You can only
                return what has arrived and has not already been returned.
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
                How many are you sending back?
              </span>
              <button
                type="button"
                onClick={() =>
                  setQuantities(
                    Object.fromEntries(lines.map((item) => [item.sku, String(returnableOf(item))])),
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

            {lines.map((item, index) => {
              const can = returnableOf(item);
              const problem = problemWith(item);
              const quantity = number(quantities[item.sku] ?? "");
              const chosen = quantity > 0 && !problem;
              return (
                <div
                  key={item.sku}
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
                    <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{item.name}</div>
                    <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                      {item.sku}
                    </div>
                    <div
                      style={{
                        ...textStyle("footnote"),
                        marginTop: 2,
                        color: problem ? colors.danger : colors.inkMuted,
                      }}
                      role={problem ? "alert" : undefined}
                    >
                      {problem
                        ? problem
                        : chosen
                          ? `Credit ${formatPrice(money(quantity * unitCredit(item)))}`
                          : item.returned
                            ? `${can} can go back · ${item.returned} already returned`
                            : `${can} of ${item.received ?? 0} can go back`}
                    </div>
                  </div>
                  <QuantityPill
                    value={quantities[item.sku] ?? ""}
                    onChange={(next) =>
                      setQuantities((current) => ({ ...current, [item.sku]: next }))
                    }
                    max={can}
                    actionLabel="Return"
                    name={item.name}
                    invalid={Boolean(problem)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[8] }}>
            {/* What is going back, as a quiet list. */}
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
              <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>RETURNING</div>
              {picks.map(({ item, quantity }) => (
                <div
                  key={item.sku}
                  style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}
                >
                  <span style={{ ...textStyle("body"), color: colors.ink }}>{item.name}</span>
                  <span style={{ ...textStyle("data"), color: colors.ink }}>
                    {quantity} {item.unit}
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
                  id="return-reason"
                  label="REASON"
                  span={1}
                  error={touched ? detailProblems.reason : null}
                >
                  <Select
                    id="return-reason"
                    options={REASON_OPTIONS}
                    value={reason}
                    placeholder="Why is it going back?"
                    searchable={false}
                    aria-invalid={touched && detailProblems.reason ? true : undefined}
                    onChange={setReason}
                  />
                </FormField>
                <FormField
                  id="return-date"
                  label="RETURN DATE"
                  span={1}
                  error={touched ? detailProblems.date : null}
                >
                  <DatePicker
                    id="return-date"
                    value={date}
                    clearable={false}
                    align="right"
                    onChange={setDate}
                  />
                </FormField>
                <FormField id="return-note" label="NOTE (OPTIONAL)" span={2}>
                  <Input
                    id="return-note"
                    autoComplete="off"
                    placeholder="Anything the vendor should know"
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
                <div style={{ ...textStyle("headline"), color: colors.ink }}>Refund</div>
                <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
                  Credit{" "}
                  <span style={{ ...textStyle("data"), color: colors.ink }}>
                    {formatPrice(credit)}
                  </span>
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
                <Chips
                  aria-label="How the refund is handled"
                  options={REFUND_OPTIONS.map(({ value, label }) => ({ value, label }))}
                  value={mode}
                  columns={3}
                  onChange={(value) => setMode(value as RefundMode)}
                />
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{refundHelp}</div>
              </div>

              {mode === "refunded" ? (
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
                    id="refund-amount"
                    label="REFUNDED AMOUNT (₹)"
                    span={1}
                    error={touched ? detailProblems.amount : null}
                  >
                    <Input
                      id="refund-amount"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={refundAmount ?? String(credit)}
                      aria-invalid={touched && detailProblems.amount ? true : undefined}
                      onChange={(event) => setRefundAmount(event.target.value)}
                    />
                  </FormField>
                  <FormField
                    id="refund-method"
                    label="PAID BACK BY"
                    span={1}
                    error={touched ? detailProblems.method : null}
                  >
                    <Select
                      id="refund-method"
                      options={PAYMENT_METHOD_OPTIONS}
                      value={method}
                      placeholder="Method"
                      searchable={false}
                      aria-invalid={touched && detailProblems.method ? true : undefined}
                      onChange={setMethod}
                    />
                  </FormField>
                  <FormField
                    id="refund-account"
                    label="RECEIVED INTO"
                    span={1}
                    error={touched ? detailProblems.account : null}
                  >
                    <Select
                      id="refund-account"
                      options={PAYMENT_ACCOUNT_OPTIONS}
                      value={accountId}
                      placeholder="Account"
                      searchable={false}
                      aria-invalid={touched && detailProblems.account ? true : undefined}
                      onChange={setAccountId}
                    />
                  </FormField>
                  <FormField
                    id="refund-date"
                    label="REFUND DATE"
                    span={1}
                    error={touched ? detailProblems.refundDate : null}
                  >
                    <DatePicker
                      id="refund-date"
                      value={refundDate}
                      clearable={false}
                      align="right"
                      onChange={setRefundDate}
                    />
                  </FormField>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
