"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Chips, Input, Select, Switch, textStyle } from "@zenzoo/ui-web";
import { useState, type ReactNode } from "react";
import {
  PAYMENT_ACCOUNT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  STORE_CREDIT,
} from "../lib/payment-options";
import {
  cartTotals,
  saleProfit,
  type CartLine,
  type Customer,
  type DiscountType,
} from "../lib/sales";
import { formatPrice } from "../lib/stock-display";
import InfoTip from "./InfoTip";
import { UnitToggle } from "./PosLines";
import ProfitBreakdown from "./ProfitBreakdown";

export interface CheckoutDetails {
  customerId?: string;
  customerName: string;
  method: string;
  accountId: string;
  billValue: string;
  billType: DiscountType;
  /** Store credit spent on this sale. */
  creditUsed: number;
  /** What is left to take by money after the credit. */
  payNow: number;
}

interface PosCheckoutProps {
  lines: CartLine[];
  customers: Customer[];
  /** Creates a customer from a typed name and returns it. */
  onNewCustomer: (name: string) => Customer;
  /** Store credit a customer holds, in rupees. */
  creditBalanceOf: (customerId: string) => number;
  onComplete: (details: CheckoutDetails) => void;
}

const WALK_IN = "walk-in";

// Short labels so four fit across the panel; the value is still the payment method code.
const METHOD_CHIPS = PAYMENT_METHOD_OPTIONS.map((option) => ({
  value: option.value,
  label: option.value === "BANK_TRANSFER" ? "Bank" : option.label,
}));

// A sensible place for the money to land for each method; the cashier can still change it.
const DEFAULT_ACCOUNT: Record<string, string> = {
  CASH: "cash-drawer",
  UPI: "hdfc-current",
  CARD: "hdfc-current",
  BANK_TRANSFER: "hdfc-current",
};

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

/** The customer, the bill with its discount and total, and how it is paid. */
export default function PosCheckout({
  lines,
  customers,
  onNewCustomer,
  creditBalanceOf,
  onComplete,
}: PosCheckoutProps) {
  const { colors, radius, spacing } = useTheme();
  const [customerId, setCustomerId] = useState(WALK_IN);
  const [billValue, setBillValue] = useState("");
  const [billType, setBillType] = useState<DiscountType>("amount");
  const [method, setMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [useCredit, setUseCredit] = useState(false);
  // Typed over the most that can be used; null means as much as possible.
  const [creditTyped, setCreditTyped] = useState<string | null>(null);

  const totals = cartTotals(lines, billValue, billType);
  const customer = customers.find((item) => item.id === customerId);
  const hasLines = lines.length > 0;

  // Store credit the customer holds, and how much of it this sale takes.
  const balance = customer ? creditBalanceOf(customer.id) : 0;
  const maxCredit = Math.round(Math.min(balance, totals.total) * 100) / 100;
  const typedCredit = creditTyped === null ? maxCredit : Number(creditTyped);
  const creditUsed =
    useCredit && maxCredit > 0
      ? Math.round(
          Math.max(0, Math.min(Number.isNaN(typedCredit) ? 0 : typedCredit, maxCredit)) * 100,
        ) / 100
      : 0;
  const payNow = Math.round((totals.total - creditUsed) * 100) / 100;
  const coveredByCredit = hasLines && creditUsed > 0 && payNow === 0;

  const unpriced = lines.find((line) => line.customPrice && line.unitPrice <= 0);
  const missing = !hasLines
    ? "Add an item to start the sale."
    : unpriced
      ? `Enter the price for ${unpriced.name}.`
      : coveredByCredit
        ? null
        : method === ""
          ? "Choose how the customer is paying."
          : accountId === ""
            ? "Choose the account the money goes into."
            : null;

  function pickCustomer(value: string) {
    setUseCredit(false);
    setCreditTyped(null);
    if (value === WALK_IN || customers.some((item) => item.id === value)) {
      setCustomerId(value);
    } else if (value.trim() !== "") {
      // Not in the list: the cashier typed a new customer.
      setCustomerId(onNewCustomer(value).id);
    }
  }

  function complete() {
    if (missing) return;
    onComplete({
      customerId: customer?.id,
      customerName: customer?.name ?? "Walk-in customer",
      method: coveredByCredit ? STORE_CREDIT : method,
      accountId: coveredByCredit ? "" : accountId,
      billValue,
      billType,
      creditUsed,
      payNow,
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
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
          <div>
            <Label>Payment</Label>
            <Chips
              aria-label="Payment method"
              options={METHOD_CHIPS}
              value={method}
              columns={4}
              onChange={(next) => {
                setMethod(next);
                setAccountId(DEFAULT_ACCOUNT[next] ?? "");
              }}
            />
          </div>
          {/* Appears once a method is chosen, already filled with the usual account. */}
          {method !== "" ? (
            <div>
              <Label>Received into</Label>
              <Select
                options={PAYMENT_ACCOUNT_OPTIONS}
                value={accountId}
                placeholder="Choose an account"
                searchable={false}
                aria-label="Account the money goes into"
                onChange={setAccountId}
              />
            </div>
          ) : null}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
        <Button type="button" variant="primary" disabled={missing !== null} onClick={complete}>
          {coveredByCredit
            ? "Complete sale · paid by store credit"
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
          {missing && hasLines ? missing : ""}
        </div>
      </div>
    </Card>
  );
}
