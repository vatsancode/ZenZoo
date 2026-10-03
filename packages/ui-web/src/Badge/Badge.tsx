import { useTheme, type ColorTokens } from "@zenzoo/design-tokens";
import type { HTMLAttributes } from "react";
import { textStyle } from "../internal/textStyle";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

function dotColor(tone: BadgeTone, colors: ColorTokens): string {
  switch (tone) {
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "danger":
      return colors.danger;
    case "neutral":
      return colors.inkFaint;
  }
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", style, children, ...props }: BadgeProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <span
      {...props}
      style={{
        ...textStyle("footnote"),
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: spacing[2],
        height: 28,
        paddingInline: `${spacing[2]}px ${spacing[3]}px`,
        borderRadius: radius.full,
        backgroundColor: colors.surfaceSunken,
        color: colors.ink,
        ...style,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: radius.full,
          backgroundColor: dotColor(tone, colors),
          flex: "none",
        }}
      />
      {children}
    </span>
  );
}
