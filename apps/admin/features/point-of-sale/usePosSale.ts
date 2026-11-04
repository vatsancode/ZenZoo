"use client";

import { addQuantities } from "@zenzoo/pricing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rememberPaymentNames } from "../../lib/payment-options";
import { cartTotals, tillUnits, type CartLine, type Sale, type SellableUnit } from "../sales/sales";
import { formatPrice } from "../../lib/stock-display";
import { createSale, type CreateSaleInput } from "../../lib/sales";
import { listTillItems, listTillPaymentOptions, type TillPaymentOptions } from "../../lib/till";
import {
  creditOf,
  listTillCustomers,
  owesOf,
  quickAddCustomer,
  type Customer,
} from "../../lib/customers";
import type { CheckoutDetails } from "./PosCheckout";

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

/**
 * Everything a point-of-sale screen needs to run a sale: the catalogue, the cart, the customers,
 * and saving the bill. Every layout of the till uses this, so they differ only in how they look.
 */
export function usePosSale() {
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
  // Changing this remounts the checkout, which clears its customer, discount and payment choices.
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
            ? {
                ...line,
                quantity: Math.min(addQuantities(line.quantity, 1), line.stock),
                quantityValue: undefined,
              }
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
          // Less than a whole one may be all that is left of something weighed.
          quantity: unit.service ? 1 : Math.min(1, unit.stock),
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

  function changeLine(sku: string, patch: Partial<CartLine>) {
    setLines((current) => current.map((line) => (line.sku === sku ? { ...line, ...patch } : line)));
  }

  function removeLine(sku: string) {
    setLines((current) => current.filter((line) => line.sku !== sku));
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
              const capped = Math.min(line.quantity, unit.stock);
              return {
                ...line,
                unitPrice: line.customPrice ? line.unitPrice : unit.price,
                stock: unit.stock,
                quantity: capped > 0 ? capped : 1,
                quantityValue: capped === line.quantity ? line.quantityValue : undefined,
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
    // The next sale opens straight away; the receipt line above the cart can be dismissed.
    setLines([]);
    setSaleCount((count) => count + 1);
    // Stock really dropped on the server - show the true numbers.
    void loadItems().catch(() => undefined);
    // What the customer owes or holds has changed.
    loadCustomers();
    return null;
  }

  const dismissFinished = useCallback(() => setFinished(null), []);

  async function addCustomer(name: string, phone: string) {
    const result = await quickAddCustomer(name, phone);
    if (typeof result !== "string") {
      setCustomers((current) => [...current, result].sort((a, b) => a.name.localeCompare(b.name)));
    }
    return result;
  }

  function creditBalanceOf(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    return customer ? creditOf(customer) : 0;
  }

  function dueBalanceOf(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    return customer ? owesOf(customer) : 0;
  }

  return {
    units,
    loadError,
    paymentOptions,
    changes,
    dismissChanges: () => setChanges(null),
    customers,
    change,
    lines,
    clearLines: () => setLines([]),
    finished,
    saleCount,
    inCart,
    addToCart,
    changeLine,
    removeLine,
    complete,
    dismissFinished,
    addCustomer,
    creditBalanceOf,
    dueBalanceOf,
  };
}
