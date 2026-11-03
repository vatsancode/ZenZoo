import { typography, useTheme, type TextStyleName } from "@zenzoo/design-tokens";
import type { CSSProperties, ReactNode } from "react";
import { textStyle } from "../internal/textStyle";

// A slow fade, so a waiting screen looks alive without drawing the eye. Turned off for anyone
// who has asked their device for less motion.
const PULSE = "zenzoo-skeleton-pulse";
const PULSE_CSS = `@keyframes ${PULSE}{0%,100%{opacity:1}50%{opacity:.45}}@media (prefers-reduced-motion:reduce){[data-skeleton]{animation:none!important}}`;

export interface SkeletonProps {
  /**
   * "line" stands in for one line of text - it takes exactly that text style's line height, so
   * the real text drops in without moving anything. "block" is a box for anything else.
   */
  variant?: "line" | "block";
  /** For a line: the text style it stands in for. */
  text?: TextStyleName;
  /** Any CSS width; a line defaults to the full width. */
  width?: number | string;
  /** For a block: its height in pixels. */
  height?: number;
  /** For placing it (margins); the look is fixed. */
  style?: CSSProperties;
}

/** A grey placeholder shown where content is still loading. Hidden from screen readers. */
export function Skeleton({
  variant = "line",
  text = "body",
  width = "100%",
  height,
  style,
}: SkeletonProps) {
  const { colors, radius, spacing } = useTheme();
  const { fontSize, lineHeight } = typography.textStyles[text];
  const isLine = variant === "line";

  return (
    <>
      <style href={PULSE} precedence="default">
        {PULSE_CSS}
      </style>
      <span
        aria-hidden
        data-skeleton=""
        style={{
          display: "block",
          width,
          height: isLine ? fontSize : (height ?? spacing[16]),
          // The bar is as tall as the letters; the margin makes up the rest of the line height.
          marginBlock: isLine ? (lineHeight - fontSize) / 2 : 0,
          borderRadius: isLine ? radius.sm : radius.lg,
          backgroundColor: colors.surfaceSunken,
          animation: `${PULSE} 1.6s ease-in-out infinite`,
          ...style,
        }}
      />
    </>
  );
}

export interface SkeletonTableColumn {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  width?: string;
}

export interface SkeletonTableProps {
  /** The real table's columns, so the headers and widths are already in place. */
  columns: SkeletonTableColumn[];
  /** How many placeholder rows; match the page size so the table doesn't grow when data lands. */
  rows?: number;
}

// Rows of slightly different lengths read as a list, not a grid of identical bars.
const WIDTHS = ["72%", "56%", "64%", "48%", "80%"];

/** A Table's layout with placeholder rows, shown until its data arrives. */
export function SkeletonTable({ columns, rows = 5 }: SkeletonTableProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <table
      aria-busy
      style={{
        width: "100%",
        tableLayout: "fixed",
        borderCollapse: "collapse",
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.lg,
      }}
    >
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={column.width ? { width: column.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              style={{
                ...textStyle("caption"),
                textAlign: column.align ?? "left",
                textTransform: "uppercase",
                color: colors.inkMuted,
                padding: `${spacing[3]}px ${spacing[5]}px`,
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, index) => (
          <tr key={index}>
            {columns.map((column, columnIndex) => (
              <td
                key={column.key}
                style={{
                  padding: `${spacing[4]}px ${spacing[5]}px`,
                  borderBottom: index === rows - 1 ? "none" : `1px solid ${colors.border}`,
                }}
              >
                <Skeleton
                  width={WIDTHS[(index + columnIndex) % WIDTHS.length]}
                  style={column.align === "right" ? { marginInlineStart: "auto" } : undefined}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
