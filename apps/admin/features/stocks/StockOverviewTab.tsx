"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Card, textStyle } from "@zenzoo/ui-web";
import { type ReactNode } from "react";
import { formatPrice, stockStatus } from "../../lib/stock-display";
import { formatDate, type StockItem } from "./stock-history";
import StatTile, { StatRow } from "../../components/StatTile";

interface Fact {
  label: string;
  value: ReactNode;
}

// Four equal columns, so facts in different rows line up with each other.
function FactGrid({ facts }: { facts: Fact[] }) {
  const { colors, spacing } = useTheme();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        columnGap: spacing[6],
        rowGap: spacing[6],
      }}
    >
      {facts.map((fact) => (
        <div key={fact.label} style={{ minWidth: 0 }}>
          <div
            style={{ ...textStyle("caption"), color: colors.inkMuted, textTransform: "uppercase" }}
          >
            {fact.label}
          </div>
          <div
            style={{
              ...textStyle("body"),
              color: colors.ink,
              marginTop: spacing[2],
              minHeight: 28,
              display: "flex",
              alignItems: "center",
            }}
          >
            {fact.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StockOverviewTab({
  item,
  lastPurchaseDate,
  lastSaleDate,
}: {
  item: StockItem;
  /** The most recent real PURCHASED movement's date, or null if nothing has ever arrived. */
  lastPurchaseDate: string | null;
  /** Always null for now - there's no real sales capability yet to report a last sale from. */
  lastSaleDate: string | null;
}) {
  const { colors, spacing } = useTheme();
  const status = stockStatus(item.quantity);
  const margin =
    item.price > 0 ? Math.round(((item.price - item.purchasePrice) / item.price) * 100) : 0;

  const itemFacts: Fact[] = [
    { label: "SKU", value: <span style={textStyle("dataSmall")}>{item.sku}</span> },
    { label: "Unit", value: item.unit },
    { label: "Status", value: <Badge tone={status.tone}>{status.label}</Badge> },
  ];
  const valueFacts: Fact[] = [
    { label: "Stock value at selling price", value: formatPrice(item.quantity * item.price) },
    {
      label: "Profit if all sold",
      value: formatPrice(item.quantity * (item.price - item.purchasePrice)),
    },
    { label: "Last purchased", value: lastPurchaseDate ? formatDate(lastPurchaseDate) : "-" },
    { label: "Last sold", value: lastSaleDate ? formatDate(lastSaleDate) : "-" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <StatRow>
        <StatTile
          label="Available"
          value={`${item.quantity} ${item.unit}`}
          hint={<Badge tone={status.tone}>{status.label}</Badge>}
        />
        <StatTile
          label="Stock value at cost"
          value={formatPrice(item.quantity * item.purchasePrice)}
          hint={`${item.quantity} ${item.unit} × ${formatPrice(item.purchasePrice)}`}
        />
        <StatTile
          label="Selling price"
          value={formatPrice(item.price)}
          hint={`Margin ${margin}%`}
        />
        <StatTile label="Purchase price" value={formatPrice(item.purchasePrice)} />
      </StatRow>

      <Card>
        <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[6] }}>
          Stock details
        </div>
        <FactGrid facts={itemFacts} />
        <hr
          style={{
            border: "none",
            borderTop: `1px solid ${colors.border}`,
            margin: `${spacing[6]}px 0`,
          }}
        />
        <FactGrid facts={valueFacts} />
      </Card>
    </div>
  );
}
