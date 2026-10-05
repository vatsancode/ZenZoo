"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Profit } from "../lib/sales";
import { formatPrice } from "../lib/stock-display";

/** The contents of a profit pop-over: what was taken, what it cost, and what is left. */
export default function ProfitBreakdown({
  title,
  profit,
  note,
}: {
  title: string;
  profit: Profit;
  note: string;
}) {
  const { colors, spacing } = useTheme();
  const line = (label: string, value: string, color: string = colors.ink) => (
    <span style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}>
      <span style={{ color: colors.inkMuted }}>{label}</span>
      <span style={{ ...textStyle("data"), color }}>{value}</span>
    </span>
  );

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
      <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{title}</span>
      {line("Selling price", formatPrice(profit.revenue))}
      {line("Cost", profit.known ? formatPrice(profit.cost) : "Not recorded")}
      <span
        style={{
          borderTop: `1px solid ${colors.border}`,
          paddingTop: spacing[3],
          display: "flex",
          flexDirection: "column",
          gap: spacing[3],
        }}
      >
        {profit.known
          ? line(
              "Profit",
              `${formatPrice(profit.profit)} · ${profit.margin}%`,
              profit.profit < 0 ? colors.danger : colors.success,
            )
          : line("Profit", "Can't be worked out", colors.inkMuted)}
      </span>
      <span style={{ color: colors.inkMuted }}>
        {profit.known ? note : "An item has no purchase price recorded."}
      </span>
    </span>
  );
}
