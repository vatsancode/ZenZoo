import { useTheme, type ColorTokens } from "@zenzoo/design-tokens";
import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { textStyle } from "../internal/textStyle";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

function variantStyle(variant: ButtonVariant, colors: ColorTokens): CSSProperties {
  switch (variant) {
    case "primary":
      return { backgroundColor: colors.accent, color: colors.onAccent };
    case "secondary":
      return { backgroundColor: colors.surfaceSunken, color: colors.ink };
    case "danger":
      return { backgroundColor: colors.danger, color: colors.onAccent };
  }
}

export function Button({ variant = "primary", style, disabled, ...props }: ButtonProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        ...textStyle("headline"),
        height: 44,
        paddingInline: spacing[6],
        borderRadius: radius.full,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.08s ease, opacity 0.12s ease",
        ...variantStyle(variant, colors),
        ...style,
      }}
      onMouseDown={(event) => {
        if (!disabled) event.currentTarget.style.transform = "scale(0.97)";
        props.onMouseDown?.(event);
      }}
      onMouseUp={(event) => {
        event.currentTarget.style.transform = "scale(1)";
        props.onMouseUp?.(event);
      }}
    />
  );
}
