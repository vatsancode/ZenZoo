import { useTheme, type ColorTokens } from "@zenzoo/design-tokens";
import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { textStyle } from "../internal/textStyle";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner and ignores clicks until the work behind the button finishes. */
  loading?: boolean;
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

export function Button({
  variant = "primary",
  style,
  disabled: disabledProp,
  loading = false,
  children,
  ...props
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const disabled = disabledProp || loading;

  return (
    <button
      {...props}
      disabled={disabled}
      aria-busy={loading || undefined}
      style={{
        ...textStyle("headline"),
        height: 44,
        paddingInline: spacing[6],
        borderRadius: radius.full,
        border: "none",
        cursor: loading ? "progress" : disabled ? "not-allowed" : "pointer",
        opacity: loading ? 0.75 : disabled ? 0.4 : 1,
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
    >
      {loading ? (
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 16 16"
          style={{ marginRight: spacing[2], flexShrink: 0 }}
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="28 10"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 8 8"
              to="360 8 8"
              dur="0.8s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      ) : null}
      {children}
    </button>
  );
}
