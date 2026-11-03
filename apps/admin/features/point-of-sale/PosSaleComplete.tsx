"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Modal, textStyle } from "@zenzoo/ui-web";
import { accountLabel, paymentMethodLabel } from "../../lib/payment-options";
import { formatDate, formatPrice } from "../../lib/stock-display";
import type { Sale } from "../sales/sales";

interface PosSaleCompleteProps {
  /** The sale just saved, or null while none is being shown. */
  sale: Sale | null;
  /** Change handed back to the customer, in rupees. */
  change: number;
  onNewSale: () => void;
}

/** The receipt shown once a sale is saved, with a button to start the next one. */
export default function PosSaleComplete({ sale, change, onNewSale }: PosSaleCompleteProps) {
  const { colors, spacing } = useTheme();

  return (
    <Modal open={sale !== null} onClose={onNewSale}>
      {sale ? (
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Sale complete</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            {sale.number} · {formatDate(sale.date)} · {sale.customerName}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[3],
              marginTop: spacing[5],
            }}
          >
            {sale.lines.map((line) => (
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>Total</span>
              <span style={{ ...textStyle("title2"), color: colors.ink }}>
                {formatPrice(sale.total)}
              </span>
            </div>
            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
              {sale.creditUsed ? `${formatPrice(sale.creditUsed)} paid with store credit. ` : ""}
              {sale.payments
                .map(
                  (payment) =>
                    `${formatPrice(payment.amount)} by ${paymentMethodLabel(payment.method)} into ${accountLabel(payment.accountId)}.`,
                )
                .join(" ")}
              {sale.dueAmount ? ` ${formatPrice(sale.dueAmount)} left on account.` : ""}
              {sale.payments.length === 0 && !sale.dueAmount ? "No money taken." : ""}
            </div>
            {change > 0 ? (
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
              >
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>Change given</span>
                <span style={{ ...textStyle("title3"), color: colors.success }}>
                  {formatPrice(change)}
                </span>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: spacing[6] }}>
            <Button type="button" variant="primary" onClick={onNewSale}>
              New sale
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
