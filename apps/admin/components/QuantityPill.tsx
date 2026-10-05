"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";

interface QuantityPillProps {
  /** What is typed; "" means nothing chosen yet. */
  value: string;
  onChange: (value: string) => void;
  /** The most that can be chosen. */
  max: number;
  /** Shown on the button before anything is chosen, e.g. "Receive" or "Return". */
  actionLabel: string;
  /** Names the row for screen readers, e.g. a product name. */
  name: string;
  invalid?: boolean;
}

/** One control per row: an outlined action pill that turns into a - 3 + counter once used. */
export default function QuantityPill({
  value,
  onChange,
  max,
  actionLabel,
  name,
  invalid,
}: QuantityPillProps) {
  const { colors, radius, spacing } = useTheme();
  const number = Number(value) || 0;

  const set = (next: number) =>
    onChange(next <= 0 ? "" : String(Math.round(Math.min(next, max) * 100) / 100));

  if (value === "") {
    return (
      <button
        type="button"
        aria-label={`${actionLabel} ${name}`}
        onClick={() => set(1)}
        style={{
          ...textStyle("bodyMedium"),
          height: 36,
          paddingInline: spacing[5],
          border: `1px solid ${colors.border}`,
          borderRadius: radius.full,
          backgroundColor: "transparent",
          color: colors.ink,
          cursor: "pointer",
        }}
      >
        {actionLabel}
      </button>
    );
  }

  const round = (label: string, aria: string, by: number) => (
    <button
      type="button"
      aria-label={aria}
      onClick={() => set(number + by)}
      style={{
        ...textStyle("bodyMedium"),
        width: 32,
        height: 32,
        border: "none",
        borderRadius: radius.full,
        background: "transparent",
        color: colors.inkMuted,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: 2,
        borderRadius: radius.full,
        border: `1px solid ${invalid ? colors.danger : colors.border}`,
      }}
    >
      {round("−", `Decrease ${name}`, -1)}
      <input
        inputMode="decimal"
        autoComplete="off"
        aria-label={`Quantity for ${name}`}
        value={value}
        onChange={(event) => {
          // Digits and one decimal point only.
          if (/^\d*\.?\d*$/.test(event.target.value)) onChange(event.target.value);
        }}
        style={{
          ...textStyle("data"),
          width: 44,
          height: 32,
          border: "none",
          outline: "none",
          background: "transparent",
          color: colors.ink,
          textAlign: "center",
        }}
      />
      {round("+", `Increase ${name}`, 1)}
    </div>
  );
}
