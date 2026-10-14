import { useTheme } from "@zenzoo/design-tokens";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "../Icon";
import { textStyle } from "../internal/textStyle";

export interface CheckboxProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "role" | "children"
> {
  /** "mixed" shows a dash - for a "select all" box when only some items are picked. */
  checked: boolean | "mixed";
  onChange: (checked: boolean) => void;
  /** Clicking the label toggles the box too. Without one, give it an `aria-label`. */
  label?: ReactNode;
}

const BOX_SIZE = 20;

/** A tick box for picking items from a list, or opting in to something. */
export function Checkbox({ checked, onChange, label, disabled, style, ...props }: CheckboxProps) {
  const { colors, radius, spacing } = useTheme();
  const on = checked !== false;

  return (
    <button
      {...props}
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(checked !== true)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: spacing[3],
        padding: 0,
        border: "none",
        background: "none",
        textAlign: "left",
        color: colors.ink,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: BOX_SIZE,
          height: BOX_SIZE,
          flexShrink: 0,
          boxSizing: "border-box",
          borderRadius: radius.sm,
          border: `1.5px solid ${on ? colors.accent : colors.inkFaint}`,
          backgroundColor: on ? colors.accent : colors.surfaceRaised,
          color: colors.onAccent,
          transition: "background-color 0.12s ease, border-color 0.12s ease",
        }}
      >
        {checked === true ? <Icon name="check" size={16} /> : null}
        {checked === "mixed" ? (
          <span
            style={{
              width: 10,
              height: 2,
              borderRadius: radius.full,
              backgroundColor: "currentColor",
            }}
          />
        ) : null}
      </span>
      {label ? <span style={textStyle("body")}>{label}</span> : null}
    </button>
  );
}
