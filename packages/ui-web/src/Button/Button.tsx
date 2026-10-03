import { colors, radius, spacing, typography } from "@zenzoo/design-tokens";
import type { ButtonHTMLAttributes, CSSProperties } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: { backgroundColor: colors.primary, color: colors.textInverse },
  secondary: {
    backgroundColor: colors.background,
    color: colors.textPrimary,
    border: `1px solid ${colors.border}`,
  },
  danger: { backgroundColor: colors.danger, color: colors.textInverse },
};

export function Button({ variant = "primary", style, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        fontFamily: typography.fontFamily.base,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        paddingBlock: spacing[2],
        paddingInline: spacing[4],
        borderRadius: radius.md,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...variantStyles[variant],
        ...style,
      }}
    />
  );
}
