"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { ReactNode } from "react";

/** A label, a control and an error message, placed on a 12-column form grid. */
export default function FormField({
  id,
  label,
  span,
  error,
  children,
}: {
  id: string;
  label: string;
  span: number;
  error?: string | null;
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
      ) : null}
    </div>
  );
}
