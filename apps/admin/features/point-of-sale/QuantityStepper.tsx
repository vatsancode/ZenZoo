"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import { addQuantities, subtractQuantity } from "@zenzoo/pricing";
import type { CartLine } from "../sales/sales";
import { wholeNumbersOnly } from "../../lib/unitRules";

interface QuantityStepperProps {
  line: CartLine;
  onChange: (patch: Partial<CartLine>) => void;
  /** Called when "−" is pressed on the last one. */
  onRemove: () => void;
}

/** − 2 + for one cart line. Weighed or measured items take a typed amount instead of a whole count. */
export default function QuantityStepper({ line, onChange, onRemove }: QuantityStepperProps) {
  const { colors, radius, spacing } = useTheme();

  const stepButton = (text: string, aria: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      aria-label={aria}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...textStyle("bodyMedium"),
        width: 32,
        height: 32,
        border: "none",
        borderRadius: radius.full,
        background: "transparent",
        color: disabled ? colors.inkFaint : colors.inkMuted,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {text}
    </button>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "max-content",
        padding: spacing[1],
        border: `1px solid ${colors.border}`,
        borderRadius: radius.full,
      }}
    >
      {stepButton("−", `Decrease ${line.name}`, () =>
        line.quantity <= 1
          ? onRemove()
          : onChange({ quantity: subtractQuantity(line.quantity, 1), quantityValue: undefined }),
      )}
      {wholeNumbersOnly(line.unit) ? (
        <span
          style={{ ...textStyle("data"), width: 32, textAlign: "center", color: colors.ink }}
        >
          {line.quantity}
        </span>
      ) : (
        // Weighed or measured: the amount is typed, up to 3 places (0.75 kg).
        <input
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Quantity of ${line.name} in ${line.unit}`}
          value={line.quantityValue ?? String(line.quantity)}
          aria-invalid={line.quantity <= 0 || line.quantity > line.stock ? true : undefined}
          onChange={(event) => {
            const typed = event.target.value;
            if (/^\d*\.?\d{0,3}$/.test(typed)) {
              onChange({ quantityValue: typed, quantity: typed === "" ? 0 : Number(typed) });
            }
          }}
          style={{
            ...textStyle("data"),
            width: 48,
            textAlign: "center",
            color: colors.ink,
            background: "transparent",
            border: "none",
            outline: "none",
          }}
        />
      )}
      {stepButton(
        "+",
        `Increase ${line.name}`,
        () => onChange({ quantity: addQuantities(line.quantity, 1), quantityValue: undefined }),
        addQuantities(line.quantity, 1) > line.stock,
      )}
    </div>
  );
}
