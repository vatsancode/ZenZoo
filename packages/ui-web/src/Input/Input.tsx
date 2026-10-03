import { useTheme } from "@zenzoo/design-tokens";
import type { InputHTMLAttributes } from "react";
import { textStyle } from "../internal/textStyle";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ style, disabled, ...props }: InputProps) {
  const { colors, radius, spacing } = useTheme();
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";

  return (
    <input
      {...props}
      disabled={disabled}
      style={{
        ...textStyle("body"),
        height: 44,
        paddingInline: spacing[4],
        borderRadius: radius.md,
        border: `1px solid ${invalid ? colors.danger : "transparent"}`,
        color: disabled ? colors.inkFaint : colors.ink,
        backgroundColor: colors.surfaceSunken,
        boxSizing: "border-box",
        width: "100%",
        cursor: disabled ? "not-allowed" : "text",
        ...style,
      }}
    />
  );
}
