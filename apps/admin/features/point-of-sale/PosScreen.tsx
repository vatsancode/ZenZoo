"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Modal, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useRef, useState } from "react";
import { accountLabel, paymentMethodLabel, rememberPaymentNames } from "../../lib/payment-options";
import { cartTotals, tillUnits, type SellableUnit, type CartLine, type Sale } from "../sales/sales";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { createSale, type CreateSaleInput } from "../../lib/sales";
import { listTillItems, listTillPaymentOptions, type TillPaymentOptions } from "../../lib/till";
import {
  creditOf,
  listTillCustomers,
  owesOf,
  quickAddCustomer,
  type Customer,
} from "../../lib/customers";
import PosCheckout, { type CheckoutDetails } from "./PosCheckout";
import PosLines from "./PosLines";
import PosSearch from "./PosSearch";

/** The point of sale: pick products into a cart, discount, attach a customer, take payment. */
export default function PosScreen() {
  const { colors, radius, spacing } = useTheme();
  const [units, setUnits] = useState<SellableUnit[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<TillPaymentOptions | null>(null);
  // What changed in the cart when the server said the prices or stock had moved on.
  const [changes, setChanges] = useState<string[] | null>(null);
  // The id of the sale being checked out. Kept while the sale is unchanged, so retrying after a
  // dropped connection can't charge twice (the server returns the sale it already saved);
  // replaced as soon as anything about the sale changes.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [change, setChange] = useState(0);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [finished, setFinished] = useState<Sale | null>(null);
  // Changing this remounts the cart, which clears its customer, discount and payment choices.
  const [saleCount, setSaleCount] = useState(0);

  /** Customers with their current balances (what they owe, or the store credit they hold). */
  function loadCustomers() {
    listTillCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }

  /** Fresh prices and stock from the server. */
  async function loadItems(): Promise<SellableUnit[]> {
    const fresh = tillUnits(await listTillItems());
    setUnits(fresh);
    return fresh;
  }

  useEffect(() => {
    loadItems().catch((reason: unknown) =>
      setLoadError(reason instanceof Error ? reason.message : "Couldn't load the catalogue."),
    );
    listTillPaymentOptions()
      .then((options) => {
        rememberPaymentNames(options.methods, options.accounts);
        setPaymentOptions(options);
      })
      .catch((reason: unknown) =>
        setLoadError(
          reason instanceof Error ? reason.message : "Couldn't load the payment options.",
        ),
      );
    loadCustomers();
  }, []);

  const inCart = useMemo(
    () => Object.fromEntries(lines.map((line) => [line.sku, line.quantity])),
    [lines],
  );

  function addToCart(unit: SellableUnit) {
    setLines((current) => {
      const existing = current.find((line) => line.sku === unit.sku);
      if (existing) {
        return current.map((line) =>
          line.sku === unit.sku
            ? { ...line, quantity: Math.min(line.quantity + 1, line.stock) }
            : line,
        );
      }
      return [
        ...current,
        {
          sku: unit.sku,
          code: unit.code,
          productId: unit.productId,
          name: unit.name,
          unit: unit.unit,
          unitPrice: unit.price,
          quantity: 1,
          stock: unit.stock,
          unitCost: unit.unitCost,
          service: unit.service,
          customPrice: unit.customPrice,
          priceValue: unit.customPrice ? "" : undefined,
          discountValue: "",
          discountType: "amount" as const,
        },
      ];
    });
  }

  /** What the cashier typed in a discount box, as the server takes it. */
  function typedDiscount(value: string, type: "amount" | "percent") {
    const typed = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(typed) || typed <= 0) return undefined;
    // The till's own total caps a percentage at 100, so send the same.
    return { type, value: type === "percent" ? Math.min(typed, 100) : typed };
  }

  /** In words, what is different now from when each line was added - so the cashier can tell the customer. */
  function describeChanges(cart: CartLine[], fresh: SellableUnit[]): string[] {
    const out: string[] = [];
    for (const line of cart) {
      const unit = fresh.find((item) => item.sku === line.sku);
      if (!unit) {
        out.push(`${line.name} isn't available to sell any more.`);
        continue;
      }
      if (!line.customPrice && unit.price !== line.unitPrice) {
        out.push(
          `${line.name}: price changed from ${formatPrice(line.unitPrice)} to ${formatPrice(unit.price)}.`,
        );
      }
      if (unit.stock < line.quantity) {
        out.push(
          unit.stock <= 0
            ? `${line.name}: now out of stock.`
            : `${line.name}: only ${unit.stock} left (you had ${line.quantity}).`,
        );
      }
    }
    return out;
  }

  /** Saves the sale. Resolves to a message to show the cashier, or null when it went through. */
  async function complete(details: CheckoutDetails): Promise<string | null> {
    if (!paymentOptions) return "The payment options haven't loaded yet.";

    const payments: CreateSaleInput["payments"] = [];
    for (const payment of details.payments) {
      const method = paymentOptions.methods.find((option) => option.code === payment.method);
      if (!method) return "That payment method isn't available any more. Choose another.";
      payments.push({
        paymentMethodId: method.id,
        paymentAccountId: payment.accountId,
        amount: payment.amount,
      });
    }

    const order: Omit<CreateSaleInput, "id"> = {
      customerId: details.customerId,
      lines: lines.map((line) => ({
        variantId: line.sku,
        quantity: line.quantity,
        discount: typedDiscount(line.discountValue, line.discountType),
        customPrice: line.customPrice ? line.unitPrice : undefined,
      })),
      billDiscount: typedDiscount(details.billValue, details.billType),
      storeCreditAmount: details.creditUsed > 0 ? details.creditUsed : undefined,
      onAccountAmount: details.dueAmount > 0 ? details.dueAmount : undefined,
      expectedTotal: cartTotals(lines, details.billValue, details.billType).total,
      payments,
    };
    const key = JSON.stringify(order);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };

    const result = await createSale({ ...order, id: attempt.current.id });
    if (!result.ok) {
      if (result.conflict) {
        // Their balance may have moved too (store credit used elsewhere).
        loadCustomers();
        // Prices or stock moved while the bill was open: show what is true now, keep the cart.
        const fresh = await loadItems().catch(() => null);
        if (fresh) {
          setChanges(describeChanges(lines, fresh));
          setLines((current) =>
            current.map((line) => {
              const unit = fresh.find((item) => item.sku === line.sku);
              if (!unit) return line;
              return {
                ...line,
                unitPrice: line.customPrice ? line.unitPrice : unit.price,
                stock: unit.stock,
                quantity: Math.max(1, Math.min(line.quantity, unit.stock)),
              };
            }),
          );
        }
      }
      return result.error;
    }

    attempt.current = null;
    setChanges(null);
    setChange(details.changeGiven);
    setFinished(result.sale);
    // Stock really dropped on the server - show the true numbers.
    void loadItems().catch(() => undefined);
    // What the customer owes or holds has changed.
    loadCustomers();
    return null;
  }

  function newSale() {
    setChanges(null);
    setLines([]);
    setFinished(null);
    setSaleCount((count) => count + 1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <h1 style={{ ...textStyle("title1"), margin: 0 }}>Point of Sale</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: spacing[6],
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
          {loadError ? (
            <div role="alert" style={{ ...textStyle("callout"), color: colors.danger }}>
              {loadError}
            </div>
          ) : null}
          {changes ? (
            <div
              role="alert"
              style={{
                ...textStyle("callout"),
                color: colors.ink,
                backgroundColor: colors.surfaceSunken,
                border: `1px solid ${colors.warning}`,
                borderRadius: radius.md,
                padding: spacing[4],
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: spacing[4],
              }}
            >
              <div>
                <div style={{ ...textStyle("bodyMedium"), color: colors.warning }}>
                  The bill changed while it was open
                </div>
                <ul style={{ margin: `${spacing[2]}px 0 0`, paddingLeft: spacing[5] }}>
                  {changes.length > 0 ? (
                    changes.map((change) => <li key={change}>{change}</li>)
                  ) : (
                    <li>Prices or stock were updated.</li>
                  )}
                </ul>
                <div
                  style={{
                    ...textStyle("footnote"),
                    color: colors.inkMuted,
                    marginTop: spacing[2],
                  }}
                >
                  The cart now shows the current prices. Check the total, then complete the sale.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChanges(null)}
                style={{
                  ...textStyle("callout"),
                  border: "none",
                  background: "transparent",
                  color: colors.inkMuted,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          <PosSearch units={units} inCart={inCart} onAdd={addToCart} />
          <PosLines
            lines={lines}
            onLineChange={(sku, patch) =>
              setLines((current) =>
                current.map((line) => (line.sku === sku ? { ...line, ...patch } : line)),
              )
            }
            onRemove={(sku) => setLines((current) => current.filter((line) => line.sku !== sku))}
            onClear={() => setLines([])}
          />
        </div>
        <PosCheckout
          key={saleCount}
          lines={lines}
          customers={customers}
          paymentOptions={paymentOptions}
          onNewCustomer={async (name, phone) => {
            const result = await quickAddCustomer(name, phone);
            if (typeof result !== "string") {
              setCustomers((current) =>
                [...current, result].sort((a, b) => a.name.localeCompare(b.name)),
              );
            }
            return result;
          }}
          creditBalanceOf={(customerId) => {
            const customer = customers.find((item) => item.id === customerId);
            return customer ? creditOf(customer) : 0;
          }}
          dueBalanceOf={(customerId) => {
            const customer = customers.find((item) => item.id === customerId);
            return customer ? owesOf(customer) : 0;
          }}
          onComplete={complete}
        />
      </div>

      <Modal open={finished !== null} onClose={newSale}>
        {finished ? (
          <div style={{ width: 420, maxWidth: "100%" }}>
            <div style={{ ...textStyle("title3"), color: colors.ink }}>Sale complete</div>
            <div
              style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}
            >
              {finished.number} · {formatDate(finished.date)} · {finished.customerName}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: spacing[3],
                marginTop: spacing[5],
              }}
            >
              {finished.lines.map((line) => (
                <div
                  key={line.sku}
                  style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}
                >
                  <span style={{ ...textStyle("body"), color: colors.ink }}>
                    {line.name}
                    <span style={{ color: colors.inkMuted }}> × {line.quantity}</span>
                  </span>
                  <span style={{ ...textStyle("data"), color: colors.ink }}>
                    {formatPrice(line.quantity * line.unitPrice - line.discount)}
                  </span>
                </div>
              ))}
              <hr
                style={{
                  width: "100%",
                  height: 0,
                  margin: 0,
                  border: "none",
                  borderTop: `1px solid ${colors.border}`,
                }}
              />
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
              >
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>Total</span>
                <span style={{ ...textStyle("title2"), color: colors.ink }}>
                  {formatPrice(finished.total)}
                </span>
              </div>
              <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {finished.creditUsed
                  ? `${formatPrice(finished.creditUsed)} paid with store credit. `
                  : ""}
                {finished.payments
                  .map(
                    (payment) =>
                      `${formatPrice(payment.amount)} by ${paymentMethodLabel(payment.method)} into ${accountLabel(payment.accountId)}.`,
                  )
                  .join(" ")}
                {finished.dueAmount ? ` ${formatPrice(finished.dueAmount)} left on account.` : ""}
                {finished.payments.length === 0 && !finished.dueAmount ? "No money taken." : ""}
              </div>
              {change > 0 ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                    Change given
                  </span>
                  <span style={{ ...textStyle("title3"), color: colors.success }}>
                    {formatPrice(change)}
                  </span>
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: spacing[6] }}>
              <Button type="button" variant="primary" onClick={newSale}>
                New sale
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
