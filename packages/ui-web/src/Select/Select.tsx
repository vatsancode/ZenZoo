import { useTheme } from "@zenzoo/design-tokens";
import type { SelectHTMLAttributes } from "react";
import { textStyle } from "../internal/textStyle";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ style, children, disabled, ...props }: SelectProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <span style={{ position: "relative", display: "inline-block", width: "100%" }}>
      <select
        {...props}
        disabled={disabled}
        style={{
          ...textStyle("body"),
          height: 44,
          paddingInline: spacing[4],
          paddingInlineEnd: spacing[10],
          borderRadius: radius.md,
          border: "none",
          color: disabled ? colors.inkFaint : colors.ink,
          backgroundColor: colors.surfaceSunken,
          boxSizing: "border-box",
          width: "100%",
          appearance: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          ...style,
        }}
      >
        {children}
      </select>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        style={{
          position: "absolute",
          right: spacing[4],
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: colors.inkMuted,
        }}
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
