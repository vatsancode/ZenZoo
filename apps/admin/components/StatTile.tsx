"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Card, textStyle } from "@zenzoo/ui-web";
import type { ReactNode } from "react";

/** A small labelled figure, with an optional line of context under it. */
export default function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Card style={{ minWidth: 0 }}>
      <div style={{ ...textStyle("caption"), color: colors.inkMuted, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ ...textStyle("title2"), color: colors.ink, marginTop: spacing[2] }}>
        {value}
      </div>
      {hint ? (
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
          {hint}
        </div>
      ) : null}
    </Card>
  );
}

/** Lays StatTiles out in an even, wrapping row. */
export function StatRow({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: spacing[4],
      }}
    >
      {children}
    </div>
  );
}
