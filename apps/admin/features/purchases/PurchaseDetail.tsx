"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Input,
  Modal,
  Notice,
  Select,
  Tabs,
  textStyle,
} from "@zenzoo/ui-web";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  PAYMENT_ACCOUNT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  accountLabel,
  paymentMethodLabel,
} from "../../lib/payment-options";
import {
  addPayments,
  addReturn,
  canCancel,
  canReturn,
  creditTotal,
  markRefundReceived,
  purchaseBalance,
  canPay,
  canReceive,
  getPurchase,
  lineTotal,
  listPurchases,
  PURCHASE_STATUS_LABEL,
  PURCHASE_STATUS_TONE,
  purchaseTotals,
  receiveItems,
  receivingProgress,
  savePurchases,
  setPurchaseStatus,
  totalPaid,
  type Purchase,
  type PurchaseItem,
  type PurchaseReturn,
} from "./purchases";
import { today as todayIso } from "../../lib/date-ranges";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { listProducts, receiveStock, returnStock, saveProducts } from "../stocks/stocks";
import { listVendors, type Vendor } from "../vendors/vendors";
import FormField from "../../components/FormField";
import PageHeader from "../../components/PageHeader";
import ReturnSheet from "../../components/ReturnSheet";
import PaymentsModal, {
  countedRows,
  newPayRow,
  payRowProblems,
  rowsTotal,
  type PayRow,
} from "./PaymentsModal";
import ReceiveSheet, { type DeliveryInput } from "./ReceiveSheet";
import StatTile, { StatRow } from "../../components/StatTile";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Items" },
  { id: "returns", label: "Returns" },
];

/** Today as YYYY-MM-DD in the viewer's own time zone. */
const pendingOf = (item: PurchaseItem) => Math.max(item.quantity - (item.received ?? 0), 0);
/** A label above a value, for the small facts in the side cards. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...textStyle("caption"), color: colors.inkMuted, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ ...textStyle("body"), color: colors.ink, marginTop: spacing[1] }}>
        {children}
      </div>
    </div>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>
      {children}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span
        style={{
          ...textStyle(strong ? "bodyMedium" : "body"),
          color: strong ? colors.ink : colors.inkMuted,
        }}
      >
        {label}
      </span>
      <span style={{ ...textStyle(strong ? "title3" : "data"), color: colors.ink }}>{value}</span>
    </div>
  );
}

export default function PurchaseDetail({
  purchaseId,
  initialTab,
}: {
  purchaseId: string;
  /** Which tab to open on, e.g. straight to Returns after sending goods back. */
  initialTab?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  // undefined while loading, null when there is no such purchase.
  const [purchase, setPurchase] = useState<Purchase | null | undefined>(undefined);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payTouched, setPayTouched] = useState(false);
  const [payRows, setPayRows] = useState<PayRow[]>([newPayRow()]);
  const [tab, setTab] = useState(
    TABS.some((item) => item.id === initialTab) ? (initialTab as string) : "overview",
  );
  // The return whose refund is being marked as received.
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [refundAccount, setRefundAccount] = useState("");
  const [refundDate, setRefundDate] = useState(todayIso);
  const [refundTouched, setRefundTouched] = useState(false);

  useEffect(() => {
    getPurchase(purchaseId).then(setPurchase);
    listVendors().then(setVendors);
  }, [purchaseId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (purchase === undefined) {
    return (
      <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading purchase...</div>
    );
  }

  if (purchase === null) {
    return (
      <>
        <PageHeader
          title="Purchase not found"
          backHref="/purchases"
          backLabel="Back to purchases"
        />
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          This purchase doesn&apos;t exist, or was added in a session that has since reloaded.
        </div>
      </>
    );
  }

  const vendor = vendors.find((item) => item.id === purchase.vendorId);
  const vendorName = vendor?.name ?? "Unknown vendor";
  const items = purchase.items ?? [];
  const deliveries = [...(purchase.deliveries ?? [])].reverse();
  const progress = receivingProgress(purchase);
  const pendingUnits = progress.ordered - progress.received;
  const paid = totalPaid(purchase);
  // Net of goods sent back: negative means the vendor owes you (a refund pending, or a credit).
  const balance = purchaseBalance(purchase);
  const credit = creditTotal(purchase);
  const returns = [...(purchase.returns ?? [])].reverse();
  const hasReturns = returns.length > 0;
  const hasReturned = items.some((item) => (item.returned ?? 0) > 0);
  const receiving = canReceive(purchase);
  const hasDiscount = items.some((item) => (item.discount ?? 0) > 0);
  const { subtotal } = purchaseTotals(items, 0, 0, 0);
  const notExpected = purchase.status === "draft" || purchase.status === "cancelled";

  // What the Record payment popup would add, and what would stop it.
  const counted = countedRows(payRows);
  const entered = rowsTotal(payRows);
  const payProblems = [
    ...payRowProblems(payRows),
    ...(entered > Math.max(balance, 0)
      ? [`That is more than the ${formatPrice(Math.max(balance, 0))} still owed.`]
      : []),
  ];

  function refresh() {
    getPurchase(purchaseId).then(setPurchase);
  }

  async function confirmDelivery({ date, arrived }: DeliveryInput) {
    if (!purchase) return;
    const bySku = Object.fromEntries(arrived.map(({ item, quantity }) => [item.sku, quantity]));
    savePurchases(receiveItems(await listPurchases(), purchase.id, bySku, date));
    // Delivered goods go into stock.
    saveProducts(
      receiveStock(
        await listProducts(),
        arrived.map(({ item, quantity }) => ({
          productId: item.productId,
          sku: item.sku,
          quantity,
        })),
      ),
    );
    const units = arrived.reduce((sum, entry) => sum + entry.quantity, 0);
    setReceiveOpen(false);
    setTab("items");
    setNotice(
      `Delivery recorded: ${units} ${units === 1 ? "unit" : "units"} across ${arrived.length} ${arrived.length === 1 ? "product" : "products"}. Your stock has been updated.`,
    );
    refresh();
  }

  function closePayments() {
    setPaymentOpen(false);
    setPayRows([newPayRow()]);
    setPayTouched(false);
  }

  async function confirmPayments() {
    setPayTouched(true);
    if (!purchase || payProblems.length > 0 || counted.length === 0) return;
    const payments = counted.map((row) => ({
      amount: Math.round(Number(row.amount) * 100) / 100,
      method: row.method,
      accountId: row.accountId,
      date: row.date,
    }));
    savePurchases(addPayments(await listPurchases(), purchase.id, payments));
    const left = Math.round((balance - entered) * 100) / 100;
    closePayments();
    setNotice(
      `${payments.length === 1 ? "Payment" : `${payments.length} payments`} of ${formatPrice(entered)} recorded. ${left > 0 ? `${formatPrice(left)} still to pay.` : "This purchase is fully paid."}`,
    );
    refresh();
  }

  async function confirmReturn(
    ret: PurchaseReturn,
    picks: { item: PurchaseItem; quantity: number }[],
  ) {
    if (!purchase) return;
    savePurchases(addReturn(await listPurchases(), purchase.id, ret));
    // The goods leave stock.
    saveProducts(
      returnStock(
        await listProducts(),
        picks.map(({ item, quantity }) => ({ productId: item.productId, sku: item.sku, quantity })),
      ),
    );
    const units = picks.reduce((sum, entry) => sum + entry.quantity, 0);
    setReturnOpen(false);
    setTab("returns");
    setNotice(
      `Return recorded: ${units} ${units === 1 ? "unit" : "units"} worth ${formatPrice(ret.credit)} sent back. Your stock has been updated.`,
    );
    refresh();
  }

  function openRefund(id: string, expected: number) {
    setRefundFor(id);
    setRefundAmount(String(expected));
  }

  function closeRefund() {
    setRefundFor(null);
    setRefundAmount("");
    setRefundMethod("");
    setRefundAccount("");
    setRefundTouched(false);
  }

  const expected = (purchase.returns ?? []).find((ret) => ret.id === refundFor)?.refund.amount ?? 0;
  const refundValue = refundAmount.trim() === "" ? 0 : Number(refundAmount);
  const refundAmountError =
    Number.isNaN(refundValue) || refundValue <= 0
      ? "Enter the amount you got back."
      : refundValue > expected
        ? `That is more than the ${formatPrice(expected)} expected.`
        : null;

  async function confirmRefund() {
    setRefundTouched(true);
    if (
      !purchase ||
      !refundFor ||
      refundAmountError ||
      refundMethod === "" ||
      refundAccount === "" ||
      refundDate === ""
    ) {
      return;
    }
    savePurchases(
      markRefundReceived(await listPurchases(), purchase.id, refundFor, {
        amount: Math.round(refundValue * 100) / 100,
        method: refundMethod,
        accountId: refundAccount,
        date: refundDate,
      }),
    );
    closeRefund();
    setNotice("Refund marked as received.");
    refresh();
  }

  async function changeStatus(status: "ordered" | "cancelled") {
    if (!purchase) return;
    savePurchases(setPurchaseStatus(await listPurchases(), purchase.id, status));
    setCancelOpen(false);
    setNotice(status === "ordered" ? "Order placed." : "Purchase cancelled.");
    refresh();
  }

  // Columns of the items table: product, ordered, received (with its bar), pending, cost, discount, total.
  const columns = [
    "minmax(0, 1fr)",
    "90px",
    hasReturned ? "200px" : "150px",
    "90px",
    "110px",
    ...(hasDiscount ? ["100px"] : []),
    "120px",
  ].join(" ");

  // The three cards under the stats share a row, so each stretches to the tallest.
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
            <Badge tone={PURCHASE_STATUS_TONE[purchase.status]}>
              {PURCHASE_STATUS_LABEL[purchase.status]}
            </Badge>
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
            {canPay(purchase) ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPaymentOpen(true)}
                style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
              >
                Record payment
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
              <Button type="button" variant="primary" onClick={() => changeStatus("ordered")}>
                Place order
              </Button>
            ) : null}
            {receiving ? (
              <Button type="button" variant="primary" onClick={() => setReceiveOpen(true)}>
                Receive stock
              </Button>
            ) : null}
          </div>
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <Tabs aria-label="Purchase sections" tabs={TABS} value={tab} onChange={setTab} />

      <div
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}
      >
        {tab === "overview" ? (
          <>
            <StatRow>
              <StatTile
                label="Total"
                value={formatPrice(purchase.total)}
                hint={`${items.length} ${items.length === 1 ? "product" : "products"}`}
              />
              <StatTile
                label="Paid"
                value={formatPrice(paid)}
                hint={`${(purchase.payments ?? []).length} payment${(purchase.payments ?? []).length === 1 ? "" : "s"}`}
              />
              <StatTile
                label={balance < 0 ? "Vendor owes you" : "Balance due"}
                value={formatPrice(Math.abs(balance))}
                hint={
                  balance < 0 ? "Refund or credit due" : balance === 0 ? "Settled" : "Still to pay"
                }
              />
              <StatTile
                label="Received"
                value={`${progress.received} / ${progress.ordered}`}
                hint={
                  notExpected
                    ? "Nothing expected"
                    : pendingUnits <= 0
                      ? "Everything has arrived"
                      : `${pendingUnits} still to come`
                }
              />
              {hasReturns ? (
                <StatTile
                  label="Returned"
                  value={formatPrice(credit)}
                  hint={`${returns.length} return${returns.length === 1 ? "" : "s"}`}
                />
              ) : null}
            </StatRow>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: spacing[6],
                alignItems: "stretch",
              }}
            >
              <Card style={fullHeight}>
                <CardTitle>Details</CardTitle>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    columnGap: spacing[5],
                    rowGap: spacing[6],
                  }}
                >
                  <Fact label="Vendor">
                    {vendor ? (
                      <Link
                        href={`/vendors/${encodeURIComponent(vendor.id)}`}
                        style={{ color: colors.ink }}
                      >
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    marginBottom: spacing[5],
                  }}
                >
                  <div style={{ ...textStyle("headline"), color: colors.ink }}>Payments</div>
                  {canPay(purchase) ? (
                    <button
                      type="button"
                      onClick={() => setPaymentOpen(true)}
                      style={{
                        ...textStyle("bodyMedium"),
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        color: colors.accent,
                        cursor: "pointer",
                      }}
                    >
                      + Record payment
                    </button>
                  ) : null}
                </div>
                {(purchase.payments ?? []).length === 0 ? (
                  <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                    No payments recorded yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
                    {(purchase.payments ?? []).map((payment, index) => (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: spacing[4],
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...textStyle("body"), color: colors.ink }}>
                            {paymentMethodLabel(payment.method)}
                          </div>
                          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                            {accountLabel(payment.accountId)} · {formatDate(payment.date)}
                          </div>
                        </div>
                        <span style={{ ...textStyle("data"), color: colors.ink }}>
                          {formatPrice(payment.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card style={fullHeight}>
                <CardTitle>Summary</CardTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
                  <Line label="Subtotal" value={formatPrice(subtotal)} />
                  {purchase.discount ? (
                    <Line label="Extra discount" value={`- ${formatPrice(purchase.discount)}`} />
                  ) : null}
                  {purchase.tax ? <Line label="Tax" value={formatPrice(purchase.tax)} /> : null}
                  {purchase.adjustment ? (
                    <Line label="Adjustment" value={formatPrice(purchase.adjustment)} />
                  ) : null}
                  <hr
                    style={{
                      width: "100%",
                      height: 0,
                      margin: 0,
                      border: "none",
                      borderTop: `1px solid ${colors.border}`,
                    }}
                  />
                  <Line label="Total" value={formatPrice(purchase.total)} strong />
                  {hasReturns ? (
                    <>
                      <Line label="Returned goods" value={`- ${formatPrice(credit)}`} />
                      <Line
                        label="Net payable"
                        value={formatPrice(purchase.total - credit)}
                        strong
                      />
                    </>
                  ) : null}
                </div>
              </Card>
            </div>
          </>
        ) : null}

        {tab === "items" ? (
          <>
            <Card>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: spacing[4],
                  marginBottom: spacing[5],
                }}
              >
                <div style={{ ...textStyle("headline"), color: colors.ink }}>Products</div>
                {receiving ? (
                  <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    {pendingUnits} still to come · use <strong>Receive stock</strong> when a
                    delivery arrives
                  </span>
                ) : null}
              </div>

              {items.length === 0 ? (
                <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                  No item details were recorded for this purchase.
                </div>
              ) : (
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
                    const received = item.received ?? 0;
                    const pending = pendingOf(item);
                    const complete = received >= item.quantity;
                    const tone = notExpected
                      ? colors.inkFaint
                      : complete
                        ? colors.success
                        : received > 0
                          ? colors.warning
                          : colors.inkMuted;
                    return (
                      <div
                        key={item.sku}
                        onMouseEnter={() => setHoveredRow(item.sku)}
                        onMouseLeave={() =>
                          setHoveredRow((current) => (current === item.sku ? null : current))
                        }
                        style={{
                          display: "grid",
                          gridTemplateColumns: columns,
                          columnGap: spacing[3],
                          alignItems: "center",
                          minHeight: 72,
                          padding: `${spacing[3]}px ${spacing[4]}px`,
                          borderRadius: radius.lg,
                          backgroundColor:
                            hoveredRow === item.sku
                              ? `color-mix(in srgb, ${colors.ink} 5%, transparent)`
                              : "transparent",
                          transition: "background-color 120ms ease",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...textStyle("body"), color: colors.ink }}>{item.name}</div>
                          <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                            {item.sku}
                          </div>
                        </div>
                        <span style={textStyle("data")}>
                          {item.quantity} {item.unit}
                        </span>
                        {/* Received with a bar, so how far along each product is reads at a glance. */}
                        <div>
                          <span style={{ ...textStyle("data"), color: tone }}>
                            {received} of {item.quantity}
                          </span>
                          {item.returned ? (
                            <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                              {" · "}
                              {item.returned} returned
                            </span>
                          ) : null}
                          <div
                            aria-hidden="true"
                            style={{
                              height: 4,
                              marginTop: spacing[2],
                              borderRadius: radius.full,
                              backgroundColor: colors.surfaceSunken,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, (received / item.quantity) * 100)}%`,
                                height: "100%",
                                backgroundColor: tone,
                              }}
                            />
                          </div>
                        </div>
                        <span
                          style={{
                            ...textStyle("data"),
                            color: notExpected || complete ? colors.inkFaint : colors.ink,
                          }}
                        >
                          {notExpected ? "-" : complete ? "Done" : pending}
                        </span>
                        <span style={textStyle("data")}>{formatPrice(item.unitCost)}</span>
                        {hasDiscount ? (
                          <span style={{ ...textStyle("data"), color: colors.inkMuted }}>
                            {item.discount ? formatPrice(item.discount) : "-"}
                          </span>
                        ) : null}
                        <span
                          style={{ ...textStyle("data"), color: colors.ink, textAlign: "right" }}
                        >
                          {formatPrice(lineTotal(item))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
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
                          <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                            {formatDate(delivery.date)}
                          </div>
                          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                            {units} {units === 1 ? "unit" : "units"}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
                          {delivery.items.map((entry) => (
                            <div
                              key={entry.sku}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: spacing[4],
                              }}
                            >
                              <span style={{ ...textStyle("body"), color: colors.ink }}>
                                {entry.name}
                              </span>
                              <span style={{ ...textStyle("data"), color: colors.ink }}>
                                + {entry.quantity} {entry.unit}
                              </span>
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

        {tab === "returns" ? (
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: spacing[4],
                marginBottom: spacing[5],
              }}
            >
              <div style={{ ...textStyle("headline"), color: colors.ink }}>Returns</div>
              {canReturn(purchase) ? (
                <button
                  type="button"
                  onClick={() => setReturnOpen(true)}
                  style={{
                    ...textStyle("bodyMedium"),
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: colors.accent,
                    cursor: "pointer",
                  }}
                >
                  + Return items
                </button>
              ) : null}
            </div>

            {returns.length === 0 ? (
              <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                {canReturn(purchase)
                  ? "Nothing has gone back to the vendor yet. Use Return items if something arrived damaged or wrong."
                  : "Nothing has been returned on this purchase."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
                {returns.map((ret, index) => (
                  <div
                    key={ret.id}
                    style={{
                      paddingTop: index === 0 ? 0 : spacing[6],
                      borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: spacing[4],
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}
                    >
                      <div>
                        <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                          {formatDate(ret.date)} · {ret.reason}
                        </div>
                        {ret.note ? (
                          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                            {ret.note}
                          </div>
                        ) : null}
                      </div>
                      <span style={{ ...textStyle("title3"), color: colors.ink }}>
                        {formatPrice(ret.credit)}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
                      {ret.items.map((entry) => (
                        <div
                          key={entry.sku}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: spacing[4],
                          }}
                        >
                          <span style={{ ...textStyle("body"), color: colors.ink }}>
                            {entry.name}
                          </span>
                          <span style={{ ...textStyle("data"), color: colors.ink }}>
                            - {entry.quantity} {entry.unit}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: spacing[4],
                        padding: `${spacing[3]}px ${spacing[4]}px`,
                        backgroundColor: colors.surfaceSunken,
                        borderRadius: radius.md,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
                        <Badge
                          tone={
                            ret.refund.mode === "refunded"
                              ? "success"
                              : ret.refund.mode === "pending"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {ret.refund.mode === "refunded"
                            ? "Refunded"
                            : ret.refund.mode === "pending"
                              ? "Refund pending"
                              : "Adjusted against dues"}
                        </Badge>
                        <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                          {ret.refund.mode === "refunded" && ret.refund.method
                            ? `${formatPrice(ret.refund.amount)}${ret.refund.amount < ret.credit ? ` of ${formatPrice(ret.credit)}` : ""} · ${paymentMethodLabel(ret.refund.method)} · ${accountLabel(ret.refund.accountId ?? "")} · ${ret.refund.date ? formatDate(ret.refund.date) : ""}`
                            : ret.refund.mode === "pending"
                              ? `${formatPrice(ret.refund.amount)} still to come from the vendor`
                              : "Taken off what you owe"}
                        </span>
                      </div>
                      {ret.refund.mode === "pending" ? (
                        <button
                          type="button"
                          onClick={() => openRefund(ret.id, ret.refund.amount)}
                          style={{
                            ...textStyle("bodyMedium"),
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            color: colors.accent,
                            cursor: "pointer",
                          }}
                        >
                          Mark refund received
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}
      </div>

      <PaymentsModal
        open={paymentOpen}
        onClose={closePayments}
        title="Record payment"
        subtitle="Add a row for each payment."
        rows={payRows}
        onRowsChange={setPayRows}
        showErrors={payTouched}
        footerNote={
          payTouched && payProblems.length > 0 ? (
            <span style={{ color: colors.danger }}>{payProblems[0]}</span>
          ) : (
            `Balance due ${formatPrice(Math.max(balance, 0))} · Paying ${formatPrice(entered)}`
          )
        }
        doneLabel="Record payment"
        onDone={confirmPayments}
      />

      <ReturnSheet
        open={returnOpen}
        purchase={purchase}
        onClose={() => setReturnOpen(false)}
        onConfirm={confirmReturn}
      />

      <ReceiveSheet
        open={receiveOpen}
        purchase={purchase}
        onClose={() => setReceiveOpen(false)}
        onConfirm={confirmDelivery}
      />

      <Modal open={refundFor !== null} onClose={closeRefund}>
        <div style={{ width: 460, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Mark refund received</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            Record how the vendor paid it back.
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[6],
              marginTop: spacing[6],
            }}
          >
            <FormField
              id="refund-amount"
              label="REFUNDED AMOUNT (₹)"
              span={12}
              error={refundTouched ? refundAmountError : null}
            >
              <Input
                id="refund-amount"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0.00"
                value={refundAmount}
                aria-invalid={refundTouched && refundAmountError ? true : undefined}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                Expected {formatPrice(expected)}. Enter less if the vendor paid back only part.
              </span>
            </FormField>
            <FormField
              id="refund-method"
              label="PAID BACK BY"
              span={12}
              error={refundTouched && refundMethod === "" ? "Choose a method." : null}
            >
              <Select
                id="refund-method"
                options={PAYMENT_METHOD_OPTIONS}
                value={refundMethod}
                placeholder="Choose a method"
                searchable={false}
                aria-invalid={refundTouched && refundMethod === "" ? true : undefined}
                onChange={setRefundMethod}
              />
            </FormField>
            <FormField
              id="refund-account"
              label="RECEIVED INTO"
              span={12}
              error={refundTouched && refundAccount === "" ? "Choose an account." : null}
            >
              <Select
                id="refund-account"
                options={PAYMENT_ACCOUNT_OPTIONS}
                value={refundAccount}
                placeholder="Choose an account"
                searchable={false}
                aria-invalid={refundTouched && refundAccount === "" ? true : undefined}
                onChange={setRefundAccount}
              />
            </FormField>
            <FormField id="refund-date" label="REFUND DATE" span={12}>
              <DatePicker
                id="refund-date"
                value={refundDate}
                clearable={false}
                onChange={setRefundDate}
              />
            </FormField>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={closeRefund}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={confirmRefund}>
              Mark received
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Cancel this purchase?</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            Nothing has arrived yet, so no stock changes. A cancelled purchase can&apos;t be
            reopened.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button type="button" variant="danger" onClick={() => changeStatus("cancelled")}>
              Cancel purchase
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
