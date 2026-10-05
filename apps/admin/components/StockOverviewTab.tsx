"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Card, textStyle } from "@zenzoo/ui-web";
import { useMemo, type ReactNode } from "react";
import { formatPrice, stockStatus } from "../lib/stock-display";
import {
  consumptionHistory,
  formatDate,
  purchaseHistory,
  type StockItem,
} from "../lib/stock-history";
import StatTile, { StatRow } from "./StatTile";

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

export default function StockOverviewTab({ item }: { item: StockItem }) {
  const { colors, spacing } = useTheme();
  const status = stockStatus(item.quantity);
  const margin =
    item.price > 0 ? Math.round(((item.price - item.purchasePrice) / item.price) * 100) : 0;
  const lastPurchase = useMemo(() => purchaseHistory(item)[0], [item]);
  const lastSale = useMemo(
    () => consumptionHistory(item).find((movement) => movement.type === "Sale"),
    [item],
  );

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
    { label: "Last purchased", value: lastPurchase ? formatDate(lastPurchase.date) : "-" },
    { label: "Last sold", value: lastSale ? formatDate(lastSale.date) : "-" },
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
