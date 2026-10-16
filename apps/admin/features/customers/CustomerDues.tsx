"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, textStyle } from "@zenzoo/ui-web";
import type { DueEntry } from "../sales/sales";
import { formatDate, formatPrice } from "../../lib/stock-display";

/** What the customer owes on account: the balance, every credit sale and payment, and a way to collect. */
export default function CustomerDues({
  entries,
  owed,
  onRecord,
}: {
  entries: DueEntry[];
  /** What they owe, from the server's ledger balance. */
  owed: number;
  /** Opens the Record payment window. */
  onRecord: () => void;
}) {
  const { colors, spacing } = useTheme();

  return (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing[4],
          marginBottom: spacing[5],
        }}
      >
        <div>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Dues</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            Sales left on account, less what has been paid since.
          </div>
        </div>
        {owed > 0 ? (
          <Button type="button" variant="primary" onClick={onRecord}>
            Collect payment
          </Button>
        ) : null}
      </div>

      <div style={{ paddingBottom: spacing[6] }}>
        <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>OWES YOU</div>
        <div
          style={{
            ...textStyle("display"),
            color: owed > 0 ? colors.warning : colors.ink,
            marginTop: spacing[1],
          }}
        >
          {formatPrice(owed)}
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          Nothing has been sold on account to this customer.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.map((entry, index) => (
            <div
              key={`${entry.kind}-${entry.reference}`}
              style={{
                display: "grid",
                gridTemplateColumns: "96px minmax(0, 1fr) auto",
                columnGap: spacing[4],
                alignItems: "center",
                minHeight: 60,
                borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                {formatDate(entry.date)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...textStyle("body"), color: colors.ink }}>
                  {entry.kind === "credit_sale" ? `Sale ${entry.reference}` : "Payment received"}
                </div>
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  {entry.detail}
                </div>
              </div>
              <span
                style={{
                  ...textStyle("data"),
                  color: entry.amount > 0 ? colors.warning : colors.success,
                }}
              >
                {entry.amount > 0 ? "+" : "-"} {formatPrice(Math.abs(entry.amount))}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
