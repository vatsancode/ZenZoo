"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, Input, Modal, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { accountLabel, paymentMethodLabel } from "../../lib/payment-options";
import {
  canReturnSale,
  getSale,
  paidNow,
  SALE_STATUS_LABEL,
  saleRefundTotal,
  saleStatus,
  saleDiscountTotal,
  salePaymentLabel,
  saleLineNet,
  saleProfitOf,
  type Customer,
  type Sale,
} from "./sales";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { listCustomers } from "../../lib/customers";
import {
  createSaleReturn,
  listSaleRefundOptions,
  voidSale,
  type ReturnInput,
} from "../../lib/sales";
import type { TillPaymentOptions } from "../../lib/till";
import SaleReturnSheet from "./SaleReturnSheet";
import PageHeader from "../../components/PageHeader";
import StatTile, { StatRow } from "../../components/StatTile";

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

/** One sale in full: what was sold and at what price, the discounts, who bought it and how it was paid. */
export default function SaleDetail({ saleId }: { saleId: string }) {
  const { colors, radius, spacing } = useTheme();
  // undefined while loading, null when there is no such sale.
  const [sale, setSale] = useState<Sale | null | undefined>(undefined);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  // Made when the return sheet opens and kept until it goes through, so retrying after a dropped
  // connection can never take the goods back twice.
  const returnId = useRef<string | null>(null);
  const [refundOptions, setRefundOptions] = useState<TillPaymentOptions | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    getSale(saleId).then(setSale);
    // Only needed to pay a refund back, which needs sales:edit - fine to be missing otherwise.
    listSaleRefundOptions()
      .then(setRefundOptions)
      .catch(() => setRefundOptions(null));
    // Someone who can see sales may not have access to Customers - the sale keeps its name anyway.
    listCustomers(true)
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, [saleId]);

  if (sale === undefined) {
    return <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading sale...</div>;
  }

  if (sale === null) {
    return (
      <>
        <PageHeader title="Sale not found" backHref="/sales" backLabel="Back to sales" />
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          This sale doesn&apos;t exist, or you don&apos;t have access to sales.
        </div>
      </>
    );
  }

  const returns = [...(sale.returns ?? [])].reverse();
  const refunded = saleRefundTotal(sale);
  const status = saleStatus(sale);
  const customer = customers.find((item) => item.id === sale.customerId);

  async function confirmReturn(input: Omit<ReturnInput, "id">): Promise<string | null> {
    if (!sale) return "This sale is not loaded.";
    if (!returnId.current) returnId.current = crypto.randomUUID();
    const result = await createSaleReturn(sale.id, { ...input, id: returnId.current });
    if (!result.ok) return result.error;
    returnId.current = null;
    setSale(result.sale);
    setReturnOpen(false);
    const ret = result.sale.returns?.[result.sale.returns.length - 1];
    const units = ret?.items.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
    setNotice(
      `Return ${ret?.number ?? ""} recorded: ${units} ${units === 1 ? "unit" : "units"} back in stock. ${
        ret?.refund.mode === "money"
          ? `${formatPrice(ret.refund.amount)} refunded.`
          : ret?.refund.mode === "credit"
            ? `${formatPrice(ret.refund.amount)} added as store credit.`
            : "No refund given."
      }`,
    );
    return null;
  }

  async function confirmVoid() {
    if (!sale) return;
    setVoiding(true);
    setVoidError(null);
    const result = await voidSale(sale.id, voidReason);
    setVoiding(false);
    if (!result.ok) {
      setVoidError(result.error);
      return;
    }
    setSale(result.sale);
    setVoidOpen(false);
    setNotice(`Sale ${result.sale.number} cancelled. The items are back in stock.`);
  }

  const profit = saleProfitOf(sale);
  const discount = saleDiscountTotal(sale);
  const units = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
  const hasLineDiscount = sale.lines.some((line) => line.discount > 0);
  const columns = `minmax(0, 1fr) 80px 110px ${hasLineDiscount ? "110px " : ""}120px`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title={`Sale ${sale.number}`}
        subtitle={`${formatDate(sale.date)} · ${sale.customerName}`}
        backHref="/sales"
        backLabel="Back to sales"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
            <Badge
              tone={status === "completed" ? "success" : status === "voided" ? "danger" : "warning"}
            >
              {SALE_STATUS_LABEL[status]}
            </Badge>
            {canReturnSale(sale) ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  returnId.current = crypto.randomUUID();
                  setReturnOpen(true);
                }}
              >
                Return items
              </Button>
            ) : null}
            {!sale.voided && (sale.returns ?? []).length === 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setVoidReason("");
                  setVoidError(null);
                  setVoidOpen(true);
                }}
                style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
              >
                Cancel sale
              </Button>
            ) : null}
          </div>
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}
      {sale.voided ? (
        <Notice>
          This sale was cancelled{sale.voidReason ? `: ${sale.voidReason}` : ""}. The items went
          back into stock, and anything paid or put on the customer&apos;s account was reversed. The
          receipt number stays on record.
        </Notice>
      ) : null}

      <StatRow>
        <StatTile
          label="Total"
          value={formatPrice(sale.total)}
          hint={`${units} ${units === 1 ? "unit" : "units"}`}
        />
        <StatTile
          label="Discount given"
          value={formatPrice(discount)}
          hint={discount > 0 ? "On items and the bill" : "No discount"}
        />
        <StatTile
          label="Profit"
          value={profit.known ? formatPrice(profit.profit) : "-"}
          hint={profit.known ? `${profit.margin}% margin` : "Cost not recorded"}
        />
        {returns.length > 0 ? (
          <StatTile
            label="Returned"
            value={formatPrice(refunded)}
            hint={`${returns.length} return${returns.length === 1 ? "" : "s"}`}
          />
        ) : null}
        <StatTile
          label="Paid by"
          value={salePaymentLabel(sale)}
          hint={
            sale.payments.length === 0
              ? sale.dueAmount
                ? `${formatPrice(sale.dueAmount)} on account`
                : "No money taken"
              : `${Array.from(new Set(sale.payments.map((payment) => accountLabel(payment.accountId)))).join(", ")}${sale.creditUsed ? ` + ${formatPrice(sale.creditUsed)} credit` : ""}${sale.dueAmount ? ` · ${formatPrice(sale.dueAmount)} due` : ""}`
          }
        />
      </StatRow>

      <Card>
        <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>
          Items sold
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
            <span>ITEM</span>
            <span>QTY</span>
            <span>PRICE</span>
            {hasLineDiscount ? <span>DISCOUNT</span> : null}
            <span style={{ textAlign: "right" }}>TOTAL</span>
          </div>
          {sale.lines.map((line) => (
            <div
              key={line.sku}
              onMouseEnter={() => setHovered(line.sku)}
              onMouseLeave={() => setHovered((current) => (current === line.sku ? null : current))}
              style={{
                display: "grid",
                gridTemplateColumns: columns,
                columnGap: spacing[3],
                alignItems: "center",
                minHeight: 72,
                padding: `${spacing[3]}px ${spacing[4]}px`,
                borderRadius: radius.lg,
                backgroundColor:
                  hovered === line.sku
                    ? `color-mix(in srgb, ${colors.ink} 5%, transparent)`
                    : "transparent",
                transition: "background-color 120ms ease",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ ...textStyle("body"), color: colors.ink }}>{line.name}</div>
                {line.code ? (
                  <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                    {line.code}
                  </div>
                ) : null}
              </div>
              <span style={textStyle("data")}>
                {line.quantity} {line.unit}
                {line.returned ? (
                  <span
                    style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}
                  >
                    {line.returned} returned
                  </span>
                ) : null}
              </span>
              <span style={textStyle("data")}>{formatPrice(line.unitPrice)}</span>
              {hasLineDiscount ? (
                <span
                  style={{
                    ...textStyle("data"),
                    color: line.discount > 0 ? colors.warning : colors.inkFaint,
                  }}
                >
                  {line.discount > 0 ? `- ${formatPrice(line.discount)}` : "-"}
                </span>
              ) : null}
              <span style={{ ...textStyle("data"), color: colors.ink, textAlign: "right" }}>
                {formatPrice(saleLineNet(line))}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {returns.length > 0 ? (
        <Card>
          <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>
            Returns
          </div>
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}>
                  <div>
                    <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                      <span style={textStyle("dataSmall")}>{ret.number}</span> ·{" "}
                      {formatDate(ret.date)} · {ret.reason}
                    </div>
                    {ret.note ? (
                      <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                        {ret.note}
                      </div>
                    ) : null}
                  </div>
                  <span style={{ ...textStyle("title3"), color: colors.ink }}>
                    {formatPrice(ret.value)}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
                  {ret.items.map((entry) => (
                    <div
                      key={entry.sku}
                      style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}
                    >
                      <span style={{ ...textStyle("body"), color: colors.ink }}>{entry.name}</span>
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
                    gap: spacing[3],
                    padding: `${spacing[3]}px ${spacing[4]}px`,
                    backgroundColor: colors.surfaceSunken,
                    borderRadius: radius.md,
                  }}
                >
                  <Badge tone={ret.refund.mode === "none" ? "neutral" : "success"}>
                    {ret.refund.mode === "money"
                      ? "Refunded"
                      : ret.refund.mode === "credit"
                        ? "Store credit"
                        : "No refund"}
                  </Badge>
                  <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    {ret.refund.mode === "money"
                      ? `${formatPrice(ret.refund.amount)} · ${paymentMethodLabel(ret.refund.method ?? "")} · from ${accountLabel(ret.refund.accountId ?? "")}`
                      : ret.refund.mode === "credit"
                        ? `${formatPrice(ret.refund.amount)} kept on ${sale.customerName}'s account`
                        : "Nothing paid back"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: spacing[6],
          alignItems: "stretch",
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>
            Details
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              columnGap: spacing[5],
              rowGap: spacing[6],
            }}
          >
            <Fact label="Customer">{sale.customerName}</Fact>
            <Fact label="Phone">{customer?.phone ?? "-"}</Fact>
            <Fact label="Invoice">{sale.number}</Fact>
            <Fact label="Date">{formatDate(sale.date)}</Fact>
          </div>
        </Card>

        <Card style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>
            Payment
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
            {sale.creditUsed ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}>
                <div>
                  <div style={{ ...textStyle("body"), color: colors.ink }}>Store credit</div>
                  <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    Taken off {sale.customerName}&apos;s balance
                  </div>
                </div>
                <span style={{ ...textStyle("data"), color: colors.warning }}>
                  {formatPrice(sale.creditUsed)}
                </span>
              </div>
            ) : null}
            {sale.payments.map((payment, index) => (
              <div
                key={index}
                style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}
              >
                <div>
                  <div style={{ ...textStyle("body"), color: colors.ink }}>
                    {paymentMethodLabel(payment.method)}
                  </div>
                  <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    Received into {accountLabel(payment.accountId)}
                    {payment.tendered && payment.tendered > payment.amount
                      ? ` · ${formatPrice(payment.tendered)} handed over, ${formatPrice(payment.tendered - payment.amount)} change`
                      : ""}
                  </div>
                </div>
                <span style={{ ...textStyle("data"), color: colors.ink }}>
                  {formatPrice(payment.amount)}
                </span>
              </div>
            ))}
            {sale.dueAmount ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}>
                <div>
                  <div style={{ ...textStyle("body"), color: colors.ink }}>On account</div>
                  <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    To be collected from {sale.customerName}
                  </div>
                </div>
                <span style={{ ...textStyle("data"), color: colors.warning }}>
                  {formatPrice(sale.dueAmount)}
                </span>
              </div>
            ) : null}
            {sale.payments.length === 0 && !sale.dueAmount && !sale.creditUsed ? (
              <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                No payment recorded.
              </div>
            ) : null}
          </div>
        </Card>

        <Card style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>
            Summary
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
            <Line label="Subtotal" value={formatPrice(sale.subtotal)} />
            {sale.lineDiscounts > 0 ? (
              <Line label="Item discounts" value={`- ${formatPrice(sale.lineDiscounts)}`} />
            ) : null}
            {sale.billDiscount > 0 ? (
              <Line label="Bill discount" value={`- ${formatPrice(sale.billDiscount)}`} />
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
            <Line label="Total" value={formatPrice(sale.total)} strong />
            {refunded > 0 ? (
              <>
                <Line label="Refunded or credited" value={`- ${formatPrice(refunded)}`} />
                <Line label="Kept" value={formatPrice(sale.total - refunded)} strong />
              </>
            ) : null}
          </div>
        </Card>
      </div>

      <SaleReturnSheet
        open={returnOpen}
        sale={sale}
        options={refundOptions}
        onClose={() => setReturnOpen(false)}
        onConfirm={confirmReturn}
      />

      <Modal open={voidOpen} onClose={() => (voiding ? undefined : setVoidOpen(false))}>
        <div style={{ width: 440, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>
            Cancel sale {sale.number}?
          </div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            It is undone as if it never happened: the items go back into stock
            {paidNow(sale) > 0
              ? `, ${formatPrice(paidNow(sale))} is taken back out of the accounts it was paid into`
              : ""}
            {sale.dueAmount || sale.creditUsed
              ? ", and what was put on the customer's account is reversed"
              : ""}
            . The sale stays on record, marked cancelled.
          </p>
          <div style={{ marginTop: spacing[5] }}>
            <Input
              autoFocus
              autoComplete="off"
              aria-label="Why it is being cancelled"
              placeholder="Why is it being cancelled?"
              value={voidReason}
              onChange={(event) => {
                setVoidReason(event.target.value);
                setVoidError(null);
              }}
            />
          </div>
          {voidError ? (
            <div
              role="alert"
              style={{ ...textStyle("footnote"), color: colors.danger, marginTop: spacing[3] }}
            >
              {voidError}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button
              type="button"
              variant="secondary"
              disabled={voiding}
              onClick={() => setVoidOpen(false)}
            >
              Keep the sale
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={voiding || voidReason.trim() === ""}
              onClick={() => void confirmVoid()}
            >
              {voiding ? "Cancelling..." : "Cancel sale"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
