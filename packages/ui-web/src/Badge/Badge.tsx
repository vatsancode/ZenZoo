import { colors, radius, spacing, typography } from "@zenzoo/design-tokens";
import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneStyles: Record<BadgeTone, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: colors.neutral[100], color: colors.textSecondary },
  success: { backgroundColor: "#DCFCE7", color: colors.success },
  warning: { backgroundColor: "#FEF3C7", color: colors.warning },
  danger: { backgroundColor: "#FEE2E2", color: colors.danger },
};

export function Badge({ tone = "neutral", style, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: typography.fontFamily.base,
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
        paddingBlock: spacing[1],
        paddingInline: spacing[2],
        borderRadius: radius.full,
        ...toneStyles[tone],
        ...style,
      }}
    />
  );
}
