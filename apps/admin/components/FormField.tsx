"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { ReactNode } from "react";

/**
 * A label, a control and an error message, placed on a 12-column form grid. A hint is a
 * heads-up that doesn't block saving; an error, when there is one, takes its place.
 */
export default function FormField({
  id,
  label,
  span,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  span: number;
  error?: string | null;
  hint?: string | null;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        display: "flex",
        flexDirection: "column",
        gap: spacing[2],
        minWidth: 0,
      }}
    >
      <label htmlFor={id} style={{ ...textStyle("caption"), color: colors.inkMuted }}>
        {label}
      </label>
      {children}
      {error ? (
        <div style={{ ...textStyle("footnote"), color: colors.danger }} role="alert">
          {error}
        </div>
      ) : hint ? (
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted }} role="status">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
