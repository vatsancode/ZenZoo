import { useTheme } from "@zenzoo/design-tokens";
import type { ButtonHTMLAttributes } from "react";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const THUMB_SIZE = 22;

/** An on/off toggle. Label it with a neighbouring <label> or `aria-label`. */
export function Switch({ checked, onChange, disabled, style, ...props }: SwitchProps) {
  const { colors, radius, elevation } = useTheme();
  const inset = (TRACK_HEIGHT - THUMB_SIZE) / 2;

  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        flexShrink: 0,
        padding: 0,
        border: "none",
        borderRadius: radius.full,
        backgroundColor: checked ? colors.accent : colors.border,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background-color 0.12s ease",
        ...style,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: inset,
          left: checked ? TRACK_WIDTH - THUMB_SIZE - inset : inset,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: radius.full,
          backgroundColor: colors.surfaceRaised,
          boxShadow: elevation.xs.web,
          transition: "left 0.12s ease",
        }}
      />
    </button>
  );
}
