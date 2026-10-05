"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Modal, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { accountLabel, paymentMethodLabel } from "../lib/payment-options";
import {
  addCustomer,
  cartTotals,
  lineDiscount,
  dueBalance,
  dueEntries,
  listCollections,
  listCustomers,
  listSales,
  recordSale,
  sellableUnits,
  type SellableUnit,
  type CartLine,
  type Customer,
  type DueCollection,
  type Sale,
} from "../lib/sales";
import { formatDate, formatPrice } from "../lib/stock-display";
import { listCatalogueItems, type CatalogueItem } from "../lib/catalogue-items";
import { listProducts, saveProducts, sellStock, type Product } from "../lib/stocks";
import { creditBalance, creditEntries, customerSales } from "../lib/customer-insights";
import PosCheckout, { type CheckoutDetails } from "./PosCheckout";
import PosLines from "./PosLines";
import PosSearch from "./PosSearch";

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The point of sale: pick products into a cart, discount, attach a customer, take payment. */
export default function PosScreen() {
  const { colors, spacing } = useTheme();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  // Past sales, so a customer's store credit balance can be worked out.
  const [pastSales, setPastSales] = useState<Sale[]>([]);
  const [collections, setCollections] = useState<DueCollection[]>([]);
  const [change, setChange] = useState(0);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [finished, setFinished] = useState<Sale | null>(null);
  // Changing this remounts the cart, which clears its customer, discount and payment choices.
  const [saleCount, setSaleCount] = useState(0);

  useEffect(() => {
    listProducts().then(setProducts);
    listCatalogueItems().then((items) => setCatalogue([...items]));
    listCustomers().then(setCustomers);
    listSales().then(setPastSales);
    listCollections().then(setCollections);
  }, []);

  const units = useMemo(() => sellableUnits(products ?? [], catalogue), [products, catalogue]);

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

  function complete(details: CheckoutDetails) {
    const totals = cartTotals(lines, details.billValue, details.billType);
    const sale = recordSale({
      date: todayIso(),
      customerId: details.customerId,
      customerName: details.customerName,
      lines: lines.map((line) => ({
        sku: line.sku,
        productId: line.productId,
        name: line.name,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: lineDiscount(line),
        unitCost: line.unitCost,
        service: line.service,
      })),
      subtotal: totals.subtotal,
      lineDiscounts: totals.lineDiscounts,
      billDiscount: totals.billDiscount,
      total: totals.total,
      creditUsed: details.creditUsed > 0 ? details.creditUsed : undefined,
      payments: details.payments,
      dueAmount: details.dueAmount > 0 ? details.dueAmount : undefined,
    });
    // What was sold leaves stock.
    void listProducts().then((all) => {
      const next = sellStock(
        all,
        lines
          .filter((line) => !line.service)
          .map((line) => ({
            productId: line.productId,
            sku: line.sku,
            quantity: line.quantity,
          })),
      );
      saveProducts(next);
      setProducts(next);
    });
    setChange(details.changeGiven);
    setFinished(sale);
    // The credit just spent is no longer available.
    void listSales().then(setPastSales);
  }

  function newSale() {
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
          onNewCustomer={(name) => {
            const customer = addCustomer(name);
            setCustomers((current) => [customer, ...current]);
            return customer;
          }}
          creditBalanceOf={(customerId) =>
            creditBalance(creditEntries(customerSales(pastSales, customerId)))
          }
          dueBalanceOf={(customerId) =>
            dueBalance(
              dueEntries(
                customerSales(pastSales, customerId),
                collections.filter((item) => item.customerId === customerId),
              ),
            )
          }
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
