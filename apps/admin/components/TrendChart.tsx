"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { shortDate, type DayPoint } from "../lib/dashboard";
import { formatPrice } from "../lib/stock-display";

const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

/** Rounds a maximum up to a tidy number, so the axis ticks read cleanly (1,000 / 2,000 / 3,000). */
function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value / 4) ?? 10;
  return Math.ceil(value / (step * magnitude)) * step * magnitude;
}

const compact = (value: number) =>
  value >= 100000
    ? `${Math.round(value / 1000) / 100}L`
    : value >= 1000
      ? `${Math.round(value / 100) / 10}K`
      : String(value);

/**
 * Daily revenue as a single line over a faint area. One series, so there is no legend;
 * the title above names it. Hover or touch shows the day, its revenue and its orders.
 */
export default function TrendChart({ data }: { data: DayPoint[] }) {
  const { colors, radius, spacing, elevation } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...data.map((point) => point.revenue), 0));
  const x = (index: number) =>
    PAD.left + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;

  const line = data
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.revenue)}`)
    .join(" ");
  const area = data.length > 0 ? `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";
  const ticks = [0, 1, 2, 3, 4].map((step) => (max / 4) * step);

  // About five date labels, whatever the length of the range.
  const every = Math.max(1, Math.ceil(data.length / 5));

  function handleMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientX - rect.left - PAD.left;
    const index = Math.round((position / innerW) * (data.length - 1));
    setHover(Math.min(Math.max(index, 0), data.length - 1));
  }

  const active = hover !== null ? data[hover] : undefined;

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%" }}>
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Revenue by day"
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
          style={{ display: "block", touchAction: "none" }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={colors.border}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 10}
                y={y(tick) + 4}
                textAnchor="end"
                style={{ ...textStyle("caption"), fill: colors.inkMuted }}
              >
                {tick === 0 ? "0" : compact(tick)}
              </text>
            </g>
          ))}

          <path d={area} fill={colors.accent} opacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {data.map((point, index) =>
            index % every === 0 || index === data.length - 1 ? (
              <text
                key={point.date}
                x={x(index)}
                y={HEIGHT - 8}
                textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
                style={{ ...textStyle("caption"), fill: colors.inkMuted }}
              >
                {shortDate(point.date)}
              </text>
            ) : null,
          )}

          {active && hover !== null ? (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={y(0)}
                stroke={colors.border}
                strokeWidth={1}
              />
              {/* A filled dot with a ring in the surface colour, so it stays clear of the line. */}
              <circle cx={x(hover)} cy={y(active.revenue)} r={6} fill={colors.surfaceRaised} />
              <circle cx={x(hover)} cy={y(active.revenue)} r={4} fill={colors.accent} />
            </g>
          ) : null}
        </svg>
      ) : null}

      {active && hover !== null ? (
        <div
          role="status"
          style={{
            ...textStyle("footnote"),
            position: "absolute",
            top: Math.max(PAD.top, y(active.revenue) - 70),
            left: Math.min(Math.max(x(hover) + 14, 0), Math.max(width - 170, 0)),
            width: 154,
            padding: spacing[3],
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSunken,
            boxShadow: elevation.md.web,
            color: colors.ink,
            pointerEvents: "none",
          }}
        >
          <div style={{ color: colors.inkMuted }}>{shortDate(active.date)}</div>
          <div style={{ ...textStyle("data"), marginTop: spacing[1] }}>
            {formatPrice(active.revenue)}
          </div>
          <div style={{ color: colors.inkMuted }}>
            {active.orders} {active.orders === 1 ? "sale" : "sales"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
