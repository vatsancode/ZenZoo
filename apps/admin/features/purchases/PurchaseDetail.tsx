"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, Modal, Notice, Tabs, textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  cancelPurchase,
  canCancel,
  canReceive,
  deliveriesOf,
  displayStatusLabel,
  displayStatusTone,
  getPurchase,
  orderedUnits,
  pendingUnits,
  placeOrder,
  receiveDelivery,
  receivedUnits,
  type Purchase,
} from "./purchases";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { listVendors, type Vendor } from "../vendors/vendors";
import PageHeader from "../../components/PageHeader";
import ReceiveSheet, { type DeliveryInput } from "./ReceiveSheet";
import StatTile, { StatRow } from "../../components/StatTile";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Items" },
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
 * Payments and returns have no backing tables at all yet (purchase_returns/
 * purchase_return_items and the payment tables exist in the schema but
 * nothing writes to them from here), so this screen doesn't show them -
 * showing a UI for data that can never actually be saved would be worse
 * than not showing it. Receiving (draft/order/cancel/receive) is the real,
 * fully wired part.
 */
export default function PurchaseDetail({ purchaseId }: { purchaseId: string }) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const [purchase, setPurchase] = useState<Purchase | null | undefined>(undefined);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [tab, setTab] = useState("overview");

  function refresh() {
    getPurchase(purchaseId).then(setPurchase);
  }

  useEffect(() => {
    refresh();
    listVendors().then(setVendors);
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
      </div>

      <ReceiveSheet open={receiveOpen} purchase={purchase} onClose={() => setReceiveOpen(false)} onConfirm={(delivery) => void confirmDelivery(delivery)} />

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
