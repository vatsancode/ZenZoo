import { useTheme } from "@zenzoo/design-tokens";
import type { HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ style, ...props }: CardProps) {
  const { colors, radius, spacing, elevation } = useTheme();

  return (
    <div
      {...props}
      style={{
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.lg,
        padding: spacing[6],
        boxShadow: elevation.sm.web,
        ...style,
      }}
    />
  );
}
