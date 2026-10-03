import { colors, radius, spacing, typography } from "@zenzoo/design-tokens";
import type { SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ style, children, ...props }: SelectProps) {
  return (
    <select
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
    >
      {children}
    </select>
  );
}
