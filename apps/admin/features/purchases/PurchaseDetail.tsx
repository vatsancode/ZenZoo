"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, Modal, Notice, Tabs, textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  cancelPurchase,
  canCancel,
  canPay,
  canReceive,
  canReturn,
  createPurchasePayment,
  deliveriesOf,
  displayStatusLabel,
  displayStatusTone,
  getPurchase,
  listPurchasePayments,
  orderedUnits,
  pendingUnits,
  placeOrder,
  receiveDelivery,
  receivedUnits,
  type Purchase,
  type PurchaseItem,
  type PurchasePayment,
  type PurchaseReturn,
} from "./purchases";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { listVendors, type Vendor } from "../vendors/vendors";
import { accountOptions, listAccounts, type Account } from "../settings/accounts";
import { listPaymentMethods, methodOptions, type PaymentMethod } from "../settings/paymentMethods";
import PageHeader from "../../components/PageHeader";
import PaymentsModal, { countedRows, newPayRow, payRowProblems, rowsTotal, type PayRow } from "./PaymentsModal";
import ReceiveSheet, { type DeliveryInput } from "./ReceiveSheet";
import ReturnSheet from "../../components/ReturnSheet";
import StatTile, { StatRow } from "../../components/StatTile";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Items" },
  { id: "payments", label: "Payments" },
];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...textStyle("caption"), color: colors.inkMuted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ ...textStyle("body"), color: colors.ink, marginTop: spacing[1] }}>{children}</div>
    </div>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>{children}</div>;
}

function Line({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ ...textStyle(strong ? "bodyMedium" : "body"), color: strong ? colors.ink : colors.inkMuted }}>
        {label}
      </span>
      <span style={{ ...textStyle(strong ? "title3" : "data"), color: colors.ink }}>{value}</span>
    </div>
  );
}

/**
 * Payments and receiving stock are both real, fully wired here. Returns
 * have a real table (purchase_returns/purchase_return_items) but no
 * backend capability wired to it yet - the UI is back (ReturnSheet) so
 * the flow can be reviewed, but confirming a return only shows a notice
 * right now, it doesn't persist anything or touch stock.
 */
export default function PurchaseDetail({ purchaseId }: { purchaseId: string }) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const [purchase, setPurchase] = useState<Purchase | null | undefined>(undefined);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [payments, setPayments] = useState<PurchasePayment[]>([]);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentRows, setPaymentRows] = useState<PayRow[]>([newPayRow()]);
  const [savingPayments, setSavingPayments] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");

  function refresh() {
    getPurchase(purchaseId).then(setPurchase);
  }

  function refreshPayments() {
    listPurchasePayments(purchaseId).then(setPayments);
  }

  useEffect(() => {
    refresh();
    refreshPayments();
    listVendors().then(setVendors);
    listAccounts().then(setAccounts);
    listPaymentMethods().then(setMethods);
  }, [purchaseId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (purchase === undefined) {
    return <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading purchase...</div>;
  }

  if (purchase === null) {
    return (
      <>
        <PageHeader title="Purchase not found" backHref="/purchases" backLabel="Back to purchases" />
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          This purchase doesn&apos;t exist, or belongs to a different store.
        </div>
      </>
    );
  }

  const vendor = vendors.find((item) => item.id === purchase.supplierId);
  const vendorName = vendor?.name ?? "Unknown vendor";
  const items = purchase.items;
  const deliveries = [...deliveriesOf(purchase)].reverse();
  const ordered = orderedUnits(purchase);
  const received = receivedUnits(purchase);
  const pending = pendingUnits(purchase);
  const hasDiscount = items.some((item) => item.discount > 0);
  const receiving = canReceive(purchase);
  const notExpected = purchase.status === "draft" || purchase.status === "cancelled";

  async function confirmDelivery({ date, arrived }: DeliveryInput) {
    const lines = arrived.map(({ item, quantity }) => ({ purchaseItemId: item.id, quantity }));
    const result = await receiveDelivery(purchase!.id, date, lines);
    if (typeof result === "string") {
      setNotice(result);
      return;
    }
    const units = arrived.reduce((sum, entry) => sum + entry.quantity, 0);
    setReceiveOpen(false);
    setTab("items");
    setNotice(
      `Delivery recorded: ${units} ${units === 1 ? "unit" : "units"} across ${arrived.length} ${arrived.length === 1 ? "product" : "products"}. Your stock has been updated.`,
    );
    setPurchase(result);
  }

  async function handlePlaceOrder() {
    const result = await placeOrder(purchase!.id);
    if (typeof result === "string") {
      setNotice(result);
      return;
    }
    setNotice("Order placed.");
    setPurchase(result);
  }

  // UI only for now - no purchase_returns capability exists yet (see the
  // top-of-file note), so this doesn't persist the return or touch stock.
  function handleReturn(ret: PurchaseReturn, picks: { item: PurchaseItem; quantity: number }[]) {
    const units = picks.reduce((sum, entry) => sum + entry.quantity, 0);
    setReturnOpen(false);
    setNotice(
      `Return captured: ${units} ${units === 1 ? "unit" : "units"} worth ${formatPrice(ret.credit)}. Not saved yet - the backend for returns isn't wired up.`,
    );
  }

  async function handleRecordPayments() {
    const counted = countedRows(paymentRows);
    if (payRowProblems(paymentRows).length > 0 || counted.length === 0) return;
    setSavingPayments(true);
    setPaymentError(null);
    for (const row of counted) {
      const result = await createPurchasePayment(purchase!.id, {
        paymentMethodId: row.method,
        paymentAccountId: row.accountId,
        amount: Number(row.amount),
        date: row.date,
      });
      if (typeof result === "string") {
        setSavingPayments(false);
        setPaymentError(result);
        return;
      }
    }
    setSavingPayments(false);
    const total = rowsTotal(counted);
    setPaymentsOpen(false);
    setPaymentRows([newPayRow()]);
    setTab("payments");
    setNotice(`${formatPrice(total)} recorded. Your account balance has been updated.`);
    refreshPayments();
    listAccounts().then(setAccounts);
  }

  async function handleCancel() {
    const result = await cancelPurchase(purchase!.id);
    setCancelOpen(false);
    if (typeof result === "string") {
      setNotice(result);
      return;
    }
    setNotice("Purchase cancelled.");
    setPurchase(result);
  }

  const columns = ["minmax(0, 1fr)", "90px", "150px", "90px", "110px", ...(hasDiscount ? ["100px"] : []), "120px"].join(" ");
  const fullHeight: CSSProperties = { display: "flex", flexDirection: "column" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title={`Purchase from ${vendorName}`}
        subtitle={`${purchase.reference ? `Invoice ${purchase.reference} · ` : ""}${formatDate(purchase.date)}`}
        backHref="/purchases"
        backLabel="Back to purchases"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
            <Badge tone={displayStatusTone(purchase)}>{displayStatusLabel(purchase)}</Badge>
            {canReturn(purchase) ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReturnOpen(true)}
                style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
              >
                Return items
              </Button>
            ) : null}
            {canCancel(purchase) ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCancelOpen(true)}
                style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
              >
                Cancel purchase
              </Button>
            ) : null}
            {purchase.status === "draft" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/purchases/${encodeURIComponent(purchase.id)}/edit`)}
                style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
              >
                Edit
              </Button>
            ) : null}
            {purchase.status === "draft" ? (
              <Button type="button" variant="primary" onClick={() => void handlePlaceOrder()}>
                Place order
              </Button>
            ) : null}
            {receiving ? (
              <Button type="button" variant="primary" onClick={() => setReceiveOpen(true)}>
                Receive stock
              </Button>
            ) : null}
            {canPay(purchase) ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPaymentsOpen(true)}
                style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
              >
                Record payment
              </Button>
            ) : null}
          </div>
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <Tabs aria-label="Purchase sections" tabs={TABS} value={tab} onChange={setTab} />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
        {tab === "overview" ? (
          <>
            <StatRow>
              <StatTile
                label="Total"
                value={formatPrice(purchase.total)}
                hint={`${items.length} ${items.length === 1 ? "product" : "products"}`}
              />
              <StatTile
                label="Received"
                value={`${received} / ${ordered}`}
                hint={notExpected ? "Nothing expected" : pending <= 0 ? "Everything has arrived" : `${pending} still to come`}
              />
            </StatRow>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: spacing[6], alignItems: "stretch" }}>
              <Card style={fullHeight}>
                <CardTitle>Details</CardTitle>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: spacing[5], rowGap: spacing[6] }}>
                  <Fact label="Vendor">
                    {vendor ? (
                      <Link href={`/vendors/${encodeURIComponent(vendor.id)}`} style={{ color: colors.ink }}>
                        {vendor.name}
                      </Link>
                    ) : (
                      vendorName
                    )}
                  </Fact>
                  <Fact label="Invoice number">{purchase.reference ?? "-"}</Fact>
                  <Fact label="Purchase date">{formatDate(purchase.date)}</Fact>
                  <Fact label="Vendor phone">{vendor?.phone ?? "-"}</Fact>
                </div>
              </Card>

              <Card style={fullHeight}>
                <CardTitle>Summary</CardTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
                  <Line label="Subtotal" value={formatPrice(purchase.subtotal)} />
                  {purchase.discount ? <Line label="Extra discount" value={`- ${formatPrice(purchase.discount)}`} /> : null}
                  {purchase.tax ? <Line label="Tax" value={formatPrice(purchase.tax)} /> : null}
                  {purchase.adjustment ? <Line label="Adjustment" value={formatPrice(purchase.adjustment)} /> : null}
                  <hr style={{ width: "100%", height: 0, margin: 0, border: "none", borderTop: `1px solid ${colors.border}` }} />
                  <Line label="Total" value={formatPrice(purchase.total)} strong />
                </div>
              </Card>
            </div>
          </>
        ) : null}

        {tab === "items" ? (
          <>
            <Card>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: spacing[4], marginBottom: spacing[5] }}>
                <div style={{ ...textStyle("headline"), color: colors.ink }}>Products</div>
                {receiving ? (
                  <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    {pending} still to come · use <strong>Receive stock</strong> when a delivery arrives
                  </span>
                ) : null}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: columns,
                    columnGap: spacing[3],
                    padding: `0 ${spacing[4]}px ${spacing[2]}px`,
                    ...textStyle("caption"),
                    color: colors.inkMuted,
                  }}
                >
                  <span>PRODUCT</span>
                  <span>ORDERED</span>
                  <span>RECEIVED</span>
                  <span>PENDING</span>
                  <span>COST / UNIT</span>
                  {hasDiscount ? <span>DISCOUNT</span> : null}
                  <span style={{ textAlign: "right" }}>LINE TOTAL</span>
                </div>

                {items.map((item) => {
                  const complete = item.received >= item.quantity;
                  const tone = notExpected ? colors.inkFaint : complete ? colors.success : item.received > 0 ? colors.warning : colors.inkMuted;
                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setHoveredRow(item.id)}
                      onMouseLeave={() => setHoveredRow((current) => (current === item.id ? null : current))}
                      style={{
                        display: "grid",
                        gridTemplateColumns: columns,
                        columnGap: spacing[3],
                        alignItems: "center",
                        minHeight: 72,
                        padding: `${spacing[3]}px ${spacing[4]}px`,
                        borderRadius: radius.lg,
                        backgroundColor: hoveredRow === item.id ? `color-mix(in srgb, ${colors.ink} 5%, transparent)` : "transparent",
                        transition: "background-color 120ms ease",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ ...textStyle("body"), color: colors.ink }}>{item.name}</div>
                        {item.sku ? <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{item.sku}</div> : null}
                      </div>
                      <span style={textStyle("data")}>{item.quantity}</span>
                      <div>
                        <span style={{ ...textStyle("data"), color: tone }}>
                          {item.received} of {item.quantity}
                        </span>
                        <div aria-hidden="true" style={{ height: 4, marginTop: spacing[2], borderRadius: radius.full, backgroundColor: colors.surfaceSunken, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, (item.received / item.quantity) * 100)}%`, height: "100%", backgroundColor: tone }} />
                        </div>
                      </div>
                      <span style={{ ...textStyle("data"), color: notExpected || complete ? colors.inkFaint : colors.ink }}>
                        {notExpected ? "-" : complete ? "Done" : item.pending}
                      </span>
                      <span style={textStyle("data")}>{formatPrice(item.unitCost)}</span>
                      {hasDiscount ? (
                        <span style={{ ...textStyle("data"), color: colors.inkMuted }}>
                          {item.discount ? formatPrice(item.discount) : "-"}
                        </span>
                      ) : null}
                      <span style={{ ...textStyle("data"), color: colors.ink, textAlign: "right" }}>{formatPrice(item.lineTotal)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardTitle>Deliveries</CardTitle>
              {deliveries.length === 0 ? (
                <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                  {notExpected
                    ? "No deliveries - this purchase isn't active."
                    : "Nothing has arrived yet. Each time stock arrives, record it with Receive stock and it will be listed here."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
                  {deliveries.map((delivery, index) => {
                    const units = delivery.items.reduce((sum, entry) => sum + entry.quantity, 0);
                    return (
                      <div
                        key={`${delivery.date}-${index}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "140px minmax(0, 1fr)",
                          columnGap: spacing[5],
                          paddingTop: index === 0 ? 0 : spacing[5],
                          borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
                        }}
                      >
                        <div>
                          <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{formatDate(delivery.date)}</div>
                          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                            {units} {units === 1 ? "unit" : "units"}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
                          {delivery.items.map((entry, entryIndex) => (
                            <div key={entryIndex} style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}>
                              <span style={{ ...textStyle("body"), color: colors.ink }}>{entry.name}</span>
                              <span style={{ ...textStyle("data"), color: colors.ink }}>+ {entry.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        ) : null}

        {tab === "payments" ? (
          <Card>
            <CardTitle>Payments</CardTitle>
            {payments.length === 0 ? (
              <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                No payments recorded yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px minmax(0, 1fr) minmax(0, 1fr) auto",
                    columnGap: spacing[4],
                    padding: `0 ${spacing[4]}px ${spacing[2]}px`,
                    ...textStyle("caption"),
                    color: colors.inkMuted,
                  }}
                >
                  <span>DATE</span>
                  <span>METHOD</span>
                  <span>ACCOUNT</span>
                  <span style={{ textAlign: "right" }}>AMOUNT</span>
                </div>
                {payments.map((payment, index) => (
                  <div
                    key={payment.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px minmax(0, 1fr) minmax(0, 1fr) auto",
                      columnGap: spacing[4],
                      alignItems: "center",
                      minHeight: 56,
                      padding: `0 ${spacing[4]}px`,
                      borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                      {formatDate(payment.date)}
                    </span>
                    <span style={{ ...textStyle("body"), color: colors.ink }}>
                      {methods.find((method) => method.id === payment.paymentMethodId)?.name ?? "-"}
                    </span>
                    <span style={{ ...textStyle("body"), color: colors.ink }}>
                      {accounts.find((account) => account.id === payment.paymentAccountId)?.name ?? "-"}
                    </span>
                    <span style={{ ...textStyle("data"), color: colors.ink, textAlign: "right" }}>
                      {formatPrice(payment.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}
      </div>

      <ReceiveSheet open={receiveOpen} purchase={purchase} onClose={() => setReceiveOpen(false)} onConfirm={(delivery) => void confirmDelivery(delivery)} />

      <ReturnSheet
        open={returnOpen}
        purchase={purchase}
        onClose={() => setReturnOpen(false)}
        onConfirm={handleReturn}
        methodOptions={methodOptions(methods)}
        accountOptions={accountOptions(accounts)}
      />

      <PaymentsModal
        open={paymentsOpen}
        onClose={() => {
          setPaymentsOpen(false);
          setPaymentRows([newPayRow()]);
          setPaymentError(null);
        }}
        subtitle="How is this purchase being paid?"
        rows={paymentRows}
        onRowsChange={setPaymentRows}
        showErrors
        footerNote={
          paymentError ? (
            <span style={{ color: colors.danger }} role="alert">
              {paymentError}
            </span>
          ) : (
            `${formatPrice(rowsTotal(paymentRows))} recorded`
          )
        }
        doneLabel={savingPayments ? "Saving..." : "Done"}
        methodOptions={methodOptions(methods)}
        accountOptions={accountOptions(accounts)}
        onDone={() => void handleRecordPayments()}
      />

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Cancel this purchase?</div>
          <p style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}>
            Nothing has arrived yet, so no stock changes. A cancelled purchase can&apos;t be reopened.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[3], marginTop: spacing[6] }}>
            <Button type="button" variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button type="button" variant="danger" onClick={() => void handleCancel()}>
              Cancel purchase
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
