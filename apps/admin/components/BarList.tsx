"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import { useState } from "react";
import type { BarDatum } from "../lib/dashboard";
import { formatPrice } from "../lib/stock-display";

/**
 * Horizontal bars for comparing a handful of things by amount. One hue, longer is more.
 * The value sits at the bar's tip; hovering a row shows what it is and its share.
 */
export default function BarList({ data, emptyText }: { data: BarDatum[]; emptyText: string }) {
  const { colors, radius, spacing } = useTheme();
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...data.map((datum) => datum.value), 0);
  const total = data.reduce((sum, datum) => sum + datum.value, 0);

  if (data.length === 0) {
    return <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>{emptyText}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
      {data.map((datum) => {
        const active = hover === datum.label;
        return (
          <div
            key={datum.label}
            onPointerEnter={() => setHover(datum.label)}
            onPointerLeave={() => setHover((current) => (current === datum.label ? null : current))}
            title={`${datum.label}: ${formatPrice(datum.value)}${datum.detail ? ` · ${datum.detail}` : ""} · ${total > 0 ? Math.round((datum.value / total) * 100) : 0}% of the total`}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}>
              <span style={{ ...textStyle("body"), color: colors.ink, minWidth: 0 }}>
                {datum.label}
              </span>
              <span style={{ ...textStyle("data"), color: colors.ink, flex: "none" }}>
                {formatPrice(datum.value)}
              </span>
            </div>
            {/* The bar is thin, rounded at its end and square at the baseline. */}
            <div
              aria-hidden="true"
              style={{
                height: 8,
                marginTop: spacing[2],
                backgroundColor: colors.surfaceSunken,
                borderRadius: radius.sm,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${max > 0 ? Math.max((datum.value / max) * 100, 1) : 0}%`,
                  height: "100%",
                  backgroundColor: colors.accent,
                  opacity: hover === null || active ? 1 : 0.55,
                  borderTopRightRadius: radius.sm,
                  borderBottomRightRadius: radius.sm,
                  transition: "opacity 120ms ease",
                }}
              />
            </div>
            {datum.detail ? (
              <div
                style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}
              >
                {datum.detail}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
