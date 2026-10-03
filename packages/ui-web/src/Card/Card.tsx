import { colors, radius, spacing, elevation } from "@zenzoo/design-tokens";
import type { HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ style, ...props }: CardProps) {
  return (
    <div
      {...props}
      style={{
        backgroundColor: colors.background,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: spacing[4],
        boxShadow: elevation.sm.web,
        ...style,
      }}
    />
  );
}
