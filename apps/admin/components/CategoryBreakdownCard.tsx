"use client";

import { chartCategorical, useTheme } from "@zenzoo/design-tokens";
import { Card, Chips, textStyle } from "@zenzoo/ui-web";
import { useMemo, useState } from "react";
import type { CategoryRow } from "../lib/dashboard";
import { formatPrice } from "../lib/stock-display";

type Metric = "revenue" | "profit";

const METRICS = [
  { value: "revenue", label: "Revenue" },
  { value: "profit", label: "Profit" },
];

const SIZE = 232;
const THICKNESS = 30;
// A small gap of surface between slices, in degrees, so neighbours never touch.
const GAP_DEGREES = 1.4;

/** An arc of a ring between two angles (degrees from 12 o'clock, clockwise). */
function arc(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const point = (radius: number, angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)] as const;
  };
  const [x1, y1] = point(outer, start);
  const [x2, y2] = point(outer, end);
  const [x3, y3] = point(inner, end);
  const [x4, y4] = point(inner, start);
  const large = end - start > 180 ? 1 : 0;
  return `M${x1},${y1} A${outer},${outer} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`;
}

/**
 * Where sales come from, by category. A donut for the shape of it, and underneath
 * (beside it) the full list with every figure, so nothing depends on reading the slices.
 * Switch between revenue and profit; the centre shows the total, or the slice hovered.
 */
export default function CategoryBreakdownCard({
  rows,
  periodLabel,
}: {
  rows: CategoryRow[];
  periodLabel: string;
}) {
  const { colors, name: themeName, radius, spacing } = useTheme();
  const [metric, setMetric] = useState<Metric>("revenue");
  const [hover, setHover] = useState<string | null>(null);

  const palette = chartCategorical[themeName];
  const sorted = useMemo(() => [...rows].sort((a, b) => b[metric] - a[metric]), [rows, metric]);
  // Only positive amounts make a slice: a category that lost money has nothing to show as a share.
  const positive = sorted.filter((row) => row[metric] > 0);
  const total = positive.reduce((sum, row) => sum + row[metric], 0);
  const grandTotal = rows.reduce((sum, row) => sum + row[metric], 0);

  // The first slots get a hue each; the rest are one neutral slice, still itemised in the list.
  const slices = positive.slice(0, palette.length).map((row, index) => ({
    key: row.name,
    label: row.name,
    value: row[metric],
    color: palette[index] ?? colors.inkFaint,
  }));
  const restValue = positive.slice(palette.length).reduce((sum, row) => sum + row[metric], 0);
  if (restValue > 0) {
    slices.push({
      key: "__rest",
      label: "Everything else",
      value: restValue,
      color: colors.inkFaint,
    });
  }
  const colorOf = (name: string) =>
    slices.find((slice) => slice.key === name)?.color ?? colors.inkFaint;

  const cx = SIZE / 2;
  let cursor = 0;
  const paths = slices.map((slice) => {
    const sweep = total > 0 ? (slice.value / total) * 360 : 0;
    const start = cursor;
    cursor += sweep;
    // A lone slice is a full ring; leave no gap to open it.
    const gap = slices.length > 1 ? GAP_DEGREES : 0;
    return {
      ...slice,
      d:
        sweep >= 359.9
          ? `${arc(cx, cx, SIZE / 2 - 2, SIZE / 2 - 2 - THICKNESS, 0, 180)} ${arc(cx, cx, SIZE / 2 - 2, SIZE / 2 - 2 - THICKNESS, 180, 359.99)}`
          : arc(
              cx,
              cx,
              SIZE / 2 - 2,
              SIZE / 2 - 2 - THICKNESS,
              start + gap / 2,
              start + sweep - gap / 2,
            ),
      share: total > 0 ? Math.round((slice.value / total) * 1000) / 10 : 0,
    };
  });

  // Which slice a hovered row or slice points at: its own, or the grey one for categories past the palette.
  const activeKey =
    hover === null
      ? null
      : slices.some((slice) => slice.key === hover)
        ? hover
        : restValue > 0
          ? "__rest"
          : null;
  const activePath = paths.find((path) => path.key === activeKey);
  const hoveredRow =
    hover !== null && hover !== "__rest" ? rows.find((row) => row.name === hover) : undefined;
  const centreLabel =
    hover === "__rest"
      ? "Everything else"
      : hoveredRow
        ? hoveredRow.name
        : metric === "revenue"
          ? "Total revenue"
          : "Total profit";
  const centreValue = hover === "__rest" ? restValue : hoveredRow ? hoveredRow[metric] : grandTotal;
  const centreNote =
    hover === null
      ? periodLabel
      : activePath && centreValue > 0
        ? hoveredRow && activeKey === "__rest"
          ? "Part of everything else"
          : `${activePath.share}% of the total`
        : "No share";

  const number = (value: number, signed = false) => (
    <span style={{ ...textStyle("data"), color: signed && value < 0 ? colors.danger : colors.ink }}>
      {formatPrice(value)}
    </span>
  );

  return (
    <Card>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing[4],
          flexWrap: "wrap",
          marginBottom: spacing[6],
        }}
      >
        <div>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Sales by category</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            After returns and discounts, {periodLabel}
          </div>
        </div>
        <div style={{ width: 240 }}>
          <Chips
            aria-label="Show revenue or profit"
            options={METRICS}
            value={metric}
            columns={2}
            onChange={(next) => setMetric(next as Metric)}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          Nothing sold in {periodLabel}.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            gap: spacing[8],
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative", width: SIZE, height: SIZE }}>
            <svg
              width={SIZE}
              height={SIZE}
              role="img"
              aria-label={`${metric === "revenue" ? "Revenue" : "Profit"} by category`}
            >
              {total > 0 ? (
                paths.map((path) => (
                  <path
                    key={path.key}
                    d={path.d}
                    fill={path.color}
                    fillRule="evenodd"
                    opacity={activeKey === null || activeKey === path.key ? 1 : 0.4}
                    onPointerEnter={() => setHover(path.key)}
                    onPointerLeave={() => setHover(null)}
                    style={{ transition: "opacity 120ms ease", cursor: "default" }}
                  >
                    <title>{`${path.label}: ${formatPrice(path.value)} (${path.share}%)`}</title>
                  </path>
                ))
              ) : (
                <circle
                  cx={cx}
                  cy={cx}
                  r={SIZE / 2 - 2 - THICKNESS / 2}
                  fill="none"
                  stroke={colors.surfaceSunken}
                  strokeWidth={THICKNESS}
                />
              )}
            </svg>
            <div
              style={{
                position: "absolute",
                inset: THICKNESS + 12,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: spacing[1],
                pointerEvents: "none",
              }}
            >
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {centreLabel}
              </span>
              <span style={{ ...textStyle("title2"), color: colors.ink }}>
                {formatPrice(centreValue)}
              </span>
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{centreNote}</span>
            </div>
          </div>

          {/* Every category, with its figures: the table view of the chart. */}
          <div
            style={{
              minWidth: 0,
              // Scrolls on its own once there are more categories than fit beside the chart.
              maxHeight: SIZE + spacing[2],
              overflow: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: `${colors.border} transparent`,
            }}
          >
            <div style={{ minWidth: 560 }}>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  backgroundColor: colors.surfaceRaised,
                  paddingTop: spacing[1],
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.6fr) 64px 1fr 1fr 70px 64px",
                  columnGap: spacing[4],
                  padding: `0 ${spacing[3]}px ${spacing[2]}px`,
                  ...textStyle("caption"),
                  color: colors.inkMuted,
                }}
              >
                <span>CATEGORY</span>
                <span style={{ textAlign: "right" }}>UNITS</span>
                <span style={{ textAlign: "right" }}>REVENUE</span>
                <span style={{ textAlign: "right" }}>PROFIT</span>
                <span style={{ textAlign: "right" }}>MARGIN</span>
                <span style={{ textAlign: "right" }}>SHARE</span>
              </div>
              {sorted.map((row) => {
                const slice = paths.find((path) => path.key === row.name);
                const share =
                  total > 0 && row[metric] > 0 ? Math.round((row[metric] / total) * 1000) / 10 : 0;
                return (
                  <div
                    key={row.name}
                    onPointerEnter={() => setHover(row.name)}
                    onPointerLeave={() => setHover(null)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1.6fr) 64px 1fr 1fr 70px 64px",
                      columnGap: spacing[4],
                      alignItems: "center",
                      minHeight: 52,
                      padding: `0 ${spacing[3]}px`,
                      borderRadius: radius.md,
                      backgroundColor: hover === row.name ? colors.surfaceSunken : "transparent",
                      transition: "background-color 120ms ease",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: spacing[3],
                        minWidth: 0,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          flex: "none",
                          borderRadius: radius.full,
                          backgroundColor: slice ? slice.color : colorOf(row.name),
                        }}
                      />
                      <span style={{ ...textStyle("body"), color: colors.ink }}>{row.name}</span>
                    </span>
                    <span
                      style={{ textAlign: "right", ...textStyle("data"), color: colors.inkMuted }}
                    >
                      {row.units}
                    </span>
                    <span style={{ textAlign: "right" }}>{number(row.revenue)}</span>
                    <span style={{ textAlign: "right" }}>{number(row.profit, true)}</span>
                    <span
                      style={{
                        textAlign: "right",
                        ...textStyle("data"),
                        color: row.margin < 0 ? colors.danger : colors.inkMuted,
                      }}
                    >
                      {row.margin}%
                    </span>
                    <span style={{ textAlign: "right", ...textStyle("data"), color: colors.ink }}>
                      {share > 0 ? `${share}%` : "-"}
                    </span>
                  </div>
                );
              })}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.6fr) 64px 1fr 1fr 70px 64px",
                  columnGap: spacing[4],
                  alignItems: "center",
                  minHeight: 52,
                  padding: `0 ${spacing[3]}px`,
                  marginTop: spacing[2],
                  position: "sticky",
                  bottom: 0,
                  zIndex: 1,
                  backgroundColor: colors.surfaceRaised,
                  borderTop: `1px solid ${colors.border}`,
                }}
              >
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>Total</span>
                <span style={{ textAlign: "right", ...textStyle("data"), color: colors.inkMuted }}>
                  {rows.reduce((sum, row) => sum + row.units, 0)}
                </span>
                <span style={{ textAlign: "right" }}>
                  {number(rows.reduce((sum, row) => sum + row.revenue, 0))}
                </span>
                <span style={{ textAlign: "right" }}>
                  {number(
                    rows.reduce((sum, row) => sum + row.profit, 0),
                    true,
                  )}
                </span>
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
