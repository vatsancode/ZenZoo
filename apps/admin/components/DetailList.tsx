"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { ReactNode } from "react";

export interface DetailRow {
  label: string;
  value: ReactNode;
}

/** Label on the left, value on the right, one hairline-separated row per fact. */
export default function DetailList({ rows }: { rows: DetailRow[] }) {
  const { colors, spacing } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((row, index) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing[4],
            minHeight: 52,
            borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <span style={{ ...textStyle("body"), color: colors.inkMuted }}>{row.label}</span>
          <span style={{ ...textStyle("body"), color: colors.ink, textAlign: "right" }}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
