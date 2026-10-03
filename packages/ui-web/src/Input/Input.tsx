import { colors, radius, spacing, typography } from "@zenzoo/design-tokens";
import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ style, ...props }: InputProps) {
  return (
    <input
      {...props}
      style={{
        fontFamily: typography.fontFamily.base,
        fontSize: typography.fontSize.sm,
        paddingBlock: spacing[2],
        paddingInline: spacing[3],
        borderRadius: radius.sm,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        backgroundColor: colors.background,
        ...style,
      }}
    />
  );
}
