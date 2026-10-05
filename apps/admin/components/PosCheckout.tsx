"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Chips, IconButton, Input, Select, Switch, textStyle } from "@zenzoo/ui-web";
import { useState, type ReactNode } from "react";
import {
  ON_ACCOUNT,
  PAYMENT_ACCOUNT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
} from "../lib/payment-options";
import {
  cartTotals,
  saleProfit,
  type CartLine,
  type Customer,
  type DiscountType,
  type SalePayment,
} from "../lib/sales";
import { formatPrice } from "../lib/stock-display";
import InfoTip from "./InfoTip";
import { UnitToggle } from "./PosLines";
import ProfitBreakdown from "./ProfitBreakdown";

export interface CheckoutDetails {
  customerId?: string;
  customerName: string;
  /** Money taken now, one entry per way it was paid. Empty when credit or dues covered it all. */
  payments: SalePayment[];
  /** Left on the customer's account, to collect later. */
  dueAmount: number;
  /** Cash handed back to the customer across all cash payments. */
  changeGiven: number;
  billValue: string;
  billType: DiscountType;
  /** Store credit spent on this sale. */
  creditUsed: number;
}

interface PosCheckoutProps {
  lines: CartLine[];
  customers: Customer[];
  /** Creates a customer from a typed name and returns it. */
  onNewCustomer: (name: string) => Customer;
  /** Store credit a customer holds, in rupees. */
  creditBalanceOf: (customerId: string) => number;
  /** What a customer already owes on account, in rupees. */
  dueBalanceOf: (customerId: string) => number;
  onComplete: (details: CheckoutDetails) => void;
}

const WALK_IN = "walk-in";

/** A payment as the cashier is filling it in. */
interface PayLine {
  method: string;
  accountId: string;
  /** What was typed; blank on the last line means "whatever is left". */
  amount: string;
  /** For cash: what the customer handed over. Blank means the exact amount. */
  tendered: string;
}

const blankLine = (): PayLine => ({ method: "", accountId: "", amount: "", tendered: "" });

// A sensible place for the money to land for each method; the cashier can still change it.
const DEFAULT_ACCOUNT: Record<string, string> = {
  CASH: "cash-drawer",
  UPI: "hdfc-current",
  CARD: "hdfc-current",
  BANK_TRANSFER: "hdfc-current",
};

const money = (value: number) => Math.round(value * 100) / 100;
const typed = (value: string) => (value.trim() === "" ? null : Number(value));

function Label({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <div
      style={{
        ...textStyle("caption"),
        color: colors.inkMuted,
        textTransform: "uppercase",
        marginBottom: spacing[3],
      }}
    >
      {children}
    </div>
  );
}

/** The customer, the bill with its discount and total, and how it is paid: one way, or split. */
export default function PosCheckout({
  lines,
  customers,
  onNewCustomer,
  creditBalanceOf,
  dueBalanceOf,
  onComplete,
}: PosCheckoutProps) {
  const { colors, radius, spacing } = useTheme();
  const [customerId, setCustomerId] = useState(WALK_IN);
  const [billValue, setBillValue] = useState("");
  const [billType, setBillType] = useState<DiscountType>("amount");
  const [pay, setPay] = useState<PayLine[]>([blankLine()]);
  const [useCredit, setUseCredit] = useState(false);
  // Typed over the most that can be used; null means as much as possible.
  const [creditTyped, setCreditTyped] = useState<string | null>(null);

  const totals = cartTotals(lines, billValue, billType);
  const customer = customers.find((item) => item.id === customerId);
  const hasLines = lines.length > 0;

  // Store credit the customer holds, and how much of it this sale takes.
  const balance = customer ? creditBalanceOf(customer.id) : 0;
  const owes = customer ? dueBalanceOf(customer.id) : 0;
  const maxCredit = money(Math.min(balance, totals.total));
  const typedCredit = creditTyped === null ? maxCredit : Number(creditTyped);
  const creditUsed =
    useCredit && maxCredit > 0
      ? money(Math.max(0, Math.min(Number.isNaN(typedCredit) ? 0 : typedCredit, maxCredit)))
      : 0;
  const payNow = money(totals.total - creditUsed);
  const coveredByCredit = hasLines && creditUsed > 0 && payNow === 0;

  // What each line is for: a typed amount, or on the last line whatever is still left.
  const typedOthers = (index: number) =>
    pay.reduce((sum, line, i) => (i === index ? sum : sum + (typed(line.amount) ?? 0)), 0);
  const amountOf = (index: number): number => {
    const own = typed(pay[index]!.amount);
    if (own !== null) return Number.isNaN(own) ? 0 : own;
    return index === pay.length - 1 ? Math.max(money(payNow - typedOthers(index)), 0) : 0;
  };
  const amounts = pay.map((_, index) => amountOf(index));
  const covered = money(amounts.reduce((sum, value) => sum + value, 0));
  const remaining = money(payNow - covered);

  const onAccount = money(
    pay.reduce((sum, line, index) => (line.method === ON_ACCOUNT ? sum + amounts[index]! : sum), 0),
  );
  const changeGiven = money(
    pay.reduce((sum, line, index) => {
      const given = typed(line.tendered);
      return line.method === "CASH" && given !== null && given > amounts[index]!
        ? sum + (given - amounts[index]!)
        : sum;
    }, 0),
  );

  const methodChips = [
    ...PAYMENT_METHOD_OPTIONS.map((option) => ({
      value: option.value,
      label: option.value === "BANK_TRANSFER" ? "Bank" : option.label,
    })),
    ...(customer ? [{ value: ON_ACCOUNT, label: "Pay later" }] : []),
  ];
  const methodOptions = [
    ...PAYMENT_METHOD_OPTIONS,
    ...(customer ? [{ value: ON_ACCOUNT, label: "Pay later (on account)" }] : []),
  ];

  // The first thing still wrong with the payment, in the order the panel reads.
  function problemWithPayment(): string | null {
    if (coveredByCredit) return null;
    for (let index = 0; index < pay.length; index += 1) {
      const line = pay[index]!;
      const which = pay.length > 1 ? ` for payment ${index + 1}` : "";
      if (line.method === "") return `Choose how the customer is paying${which}.`;
      if (amounts[index]! <= 0) return `Enter the amount${which}.`;
      if (line.method !== ON_ACCOUNT && line.accountId === "") {
        return `Choose the account the money goes into${which}.`;
      }
      const given = typed(line.tendered);
      if (line.method === "CASH" && given !== null && given < amounts[index]!) {
        return `The cash handed over is less than the amount${which}.`;
      }
    }
    if (remaining > 0) return `${formatPrice(remaining)} is still to be paid.`;
    if (remaining < 0) return `The payments are ${formatPrice(-remaining)} more than the bill.`;
    return null;
  }

  const unpriced = lines.find((line) => line.customPrice && line.unitPrice <= 0);
  const missing = !hasLines
    ? "Add an item to start the sale."
    : unpriced
      ? `Enter the price for ${unpriced.name}.`
      : problemWithPayment();

  function pickCustomer(value: string) {
    setUseCredit(false);
    setCreditTyped(null);
    // "Pay later" only makes sense for a known customer, so a change of customer starts the payment over.
    setPay([blankLine()]);
    if (value === WALK_IN || customers.some((item) => item.id === value)) {
      setCustomerId(value);
    } else if (value.trim() !== "") {
      // Not in the list: the cashier typed a new customer.
      setCustomerId(onNewCustomer(value).id);
    }
  }

  function updateLine(index: number, patch: Partial<PayLine>) {
    setPay((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function chooseMethod(index: number, method: string) {
    updateLine(index, {
      method,
      accountId: method === ON_ACCOUNT ? "" : (DEFAULT_ACCOUNT[method] ?? ""),
      tendered: "",
    });
  }

  function addLine() {
    // Fix the last line at what it covers now, so the new one picks up whatever is left.
    setPay((current) => [
      ...current.map((line, index) =>
        index === current.length - 1 ? { ...line, amount: String(amounts[index] ?? 0) } : line,
      ),
      blankLine(),
    ]);
  }

  function complete() {
    if (missing) return;
    const money_ = pay
      .map((line, index) => ({ line, amount: amounts[index]! }))
      .filter(({ line }) => line.method !== ON_ACCOUNT);
    onComplete({
      customerId: customer?.id,
      customerName: customer?.name ?? "Walk-in customer",
      payments: coveredByCredit
        ? []
        : money_.map(({ line, amount }) => ({
            method: line.method,
            accountId: line.accountId,
            amount,
            tendered:
              line.method === "CASH" &&
              typed(line.tendered) !== null &&
              typed(line.tendered)! > amount
                ? typed(line.tendered)!
                : undefined,
          })),
      dueAmount: coveredByCredit ? 0 : onAccount,
      changeGiven: coveredByCredit ? 0 : changeGiven,
      billValue,
      billType,
      creditUsed,
    });
  }

  const row = (text: string, value: ReactNode, muted = true) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ ...textStyle("body"), color: muted ? colors.inkMuted : colors.ink }}>
        {text}
      </span>
      <span style={{ ...textStyle("data"), color: colors.ink }}>{value}</span>
    </div>
  );

  const takenNow = money(payNow - onAccount);

  return (
    <Card
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing[8],
        position: "sticky",
        top: spacing[6],
      }}
    >
      <div>
        <Label>Customer</Label>
        <Select
          options={[
            { value: WALK_IN, label: "Walk-in customer" },
            ...customers.map((item) => ({
              value: item.id,
              label: item.phone ? `${item.name} · ${item.phone}` : item.name,
            })),
          ]}
          value={customerId}
          creatable
          createLabel="Add new customer"
          aria-label="Customer"
          onChange={pickCustomer}
        />
        {owes > 0 ? (
          <div style={{ ...textStyle("footnote"), color: colors.warning, marginTop: spacing[2] }}>
            Already owes {formatPrice(owes)} on account
          </div>
        ) : null}
      </div>

      {/* The bill: what it adds up to, the discount on all of it, and the total to take. */}
      <div>
        <Label>Bill</Label>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: spacing[4],
            padding: spacing[5],
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.lg,
          }}
        >
          {row("Subtotal", formatPrice(totals.subtotal))}
          {totals.lineDiscounts > 0
            ? row("Item discounts", `- ${formatPrice(totals.lineDiscounts)}`)
            : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[3],
            }}
          >
            <label htmlFor="bill-discount" style={{ ...textStyle("body"), color: colors.inkMuted }}>
              Bill discount
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
              {totals.billDiscount > 0 ? (
                <span style={{ ...textStyle("footnote"), color: colors.success }}>
                  - {formatPrice(totals.billDiscount)}
                </span>
              ) : null}
              <div style={{ width: 80 }}>
                <Input
                  id="bill-discount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  aria-label="Discount on the whole bill"
                  value={billValue}
                  disabled={!hasLines}
                  style={{ height: 36, borderColor: colors.border, textAlign: "right" }}
                  onChange={(event) => {
                    if (/^\d*\.?\d*$/.test(event.target.value)) setBillValue(event.target.value);
                  }}
                />
              </div>
              <UnitToggle type={billType} onChange={setBillType} />
            </div>
          </div>

          <hr
            style={{
              width: "100%",
              height: 0,
              margin: 0,
              border: "none",
              borderTop: `1px solid ${colors.border}`,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span
              style={{
                ...textStyle("bodyMedium"),
                color: colors.ink,
                display: "inline-flex",
                alignItems: "center",
                gap: spacing[2],
              }}
            >
              Total
              {hasLines ? (
                <InfoTip label="Profit on this sale" mode="click" width={260}>
                  <ProfitBreakdown
                    title="Profit on this sale"
                    profit={saleProfit(lines, billValue, billType)}
                    note="After every discount, including the bill discount."
                  />
                </InfoTip>
              ) : null}
            </span>
            <span style={{ ...textStyle("title1"), color: colors.ink }}>
              {formatPrice(totals.total)}
            </span>
          </div>
          {creditUsed > 0 ? (
            <>
              {row("Store credit", `- ${formatPrice(creditUsed)}`)}
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
              >
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>To pay now</span>
                <span style={{ ...textStyle("title2"), color: colors.ink }}>
                  {formatPrice(payNow)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Only shown when this customer holds store credit, and there is something to pay. */}
      {balance > 0 && hasLines ? (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[4],
            }}
          >
            <label htmlFor="use-credit" style={{ ...textStyle("body"), color: colors.ink }}>
              Use store credit
              <span style={{ ...textStyle("footnote"), color: colors.success, display: "block" }}>
                {formatPrice(balance)} available
              </span>
            </label>
            <Switch id="use-credit" checked={useCredit} onChange={setUseCredit} />
          </div>
          {useCredit ? (
            <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
              <div style={{ width: 140 }}>
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Store credit to use"
                  value={creditTyped ?? String(maxCredit)}
                  onChange={(event) => {
                    if (/^\d*\.?\d*$/.test(event.target.value)) setCreditTyped(event.target.value);
                  }}
                />
              </div>
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                Up to {formatPrice(maxCredit)} on this bill
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {coveredByCredit ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          Paid in full with store credit. No money to take.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
          <Label>{pay.length > 1 ? "Payments" : "Payment"}</Label>

          {pay.map((line, index) => {
            const amount = amounts[index]!;
            const isCash = line.method === "CASH";
            const given = typed(line.tendered);
            const change = isCash && given !== null && given > amount ? money(given - amount) : 0;
            return (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: spacing[3],
                  padding: pay.length > 1 || line.method !== "" ? spacing[4] : 0,
                  borderRadius: radius.lg,
                  backgroundColor:
                    pay.length > 1 || line.method !== "" ? colors.surfaceSunken : "transparent",
                }}
              >
                {line.method === "" ? (
                  <Chips
                    aria-label={`Payment ${index + 1} method`}
                    options={methodChips}
                    value=""
                    columns={3}
                    onChange={(next) => chooseMethod(index, next)}
                  />
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Select
                          options={methodOptions}
                          value={line.method}
                          searchable={false}
                          aria-label={`Payment ${index + 1} method`}
                          onChange={(next) => chooseMethod(index, next)}
                        />
                      </div>
                      <div style={{ width: 112 }}>
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`Payment ${index + 1} amount`}
                          placeholder="0.00"
                          value={line.amount === "" ? String(amount || "") : line.amount}
                          style={{ borderColor: colors.border, textAlign: "right" }}
                          onChange={(event) => {
                            if (/^\d*\.?\d*$/.test(event.target.value)) {
                              updateLine(index, { amount: event.target.value });
                            }
                          }}
                        />
                      </div>
                      {pay.length > 1 ? (
                        <IconButton
                          icon="close"
                          label={`Remove payment ${index + 1}`}
                          onClick={() => setPay((current) => current.filter((_, i) => i !== index))}
                        />
                      ) : null}
                    </div>

                    {line.method === ON_ACCOUNT ? (
                      <div style={{ ...textStyle("footnote"), color: colors.warning }}>
                        {formatPrice(amount)} goes on {customer?.name ?? "the customer"}&apos;s
                        account, to collect later.
                      </div>
                    ) : (
                      <Select
                        options={PAYMENT_ACCOUNT_OPTIONS}
                        value={line.accountId}
                        placeholder="Received into"
                        searchable={false}
                        aria-label={`Payment ${index + 1} account`}
                        onChange={(next) => updateLine(index, { accountId: next })}
                      />
                    )}

                    {isCash ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: spacing[3],
                        }}
                      >
                        <label
                          htmlFor={`tendered-${index}`}
                          style={{ ...textStyle("body"), color: colors.inkMuted }}
                        >
                          Cash received
                        </label>
                        <div style={{ width: 112 }}>
                          <Input
                            id={`tendered-${index}`}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={String(amount || "")}
                            value={line.tendered}
                            aria-invalid={given !== null && given < amount ? true : undefined}
                            style={{ borderColor: colors.border, textAlign: "right" }}
                            onChange={(event) => {
                              if (/^\d*\.?\d*$/.test(event.target.value)) {
                                updateLine(index, { tendered: event.target.value });
                              }
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                    {isCash && change > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                        }}
                      >
                        <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                          Change to give back
                        </span>
                        <span style={{ ...textStyle("title3"), color: colors.success }}>
                          {formatPrice(change)}
                        </span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}

          {remaining > 0 && pay[pay.length - 1]!.method !== "" ? (
            <button
              type="button"
              onClick={addLine}
              style={{
                ...textStyle("callout"),
                height: 40,
                border: `1px dashed ${colors.border}`,
                borderRadius: radius.full,
                background: "transparent",
                color: colors.inkMuted,
                cursor: "pointer",
              }}
            >
              + Add another payment · {formatPrice(remaining)} left
            </button>
          ) : null}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
        <Button type="button" variant="primary" disabled={missing !== null} onClick={complete}>
          {coveredByCredit
            ? "Complete sale · paid by store credit"
            : onAccount > 0 && takenNow === 0
              ? `Complete sale · ${formatPrice(onAccount)} on account`
              : `Complete sale · ${formatPrice(payNow)}`}
        </Button>
        <div
          style={{
            ...textStyle("footnote"),
            color: colors.inkMuted,
            textAlign: "center",
            minHeight: 18,
          }}
        >
          {missing && hasLines
            ? missing
            : onAccount > 0 && takenNow > 0
              ? `${formatPrice(takenNow)} now, ${formatPrice(onAccount)} on account`
              : ""}
        </div>
      </div>
    </Card>
  );
}
