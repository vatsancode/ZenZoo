"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, textStyle } from "@zenzoo/ui-web";
import { cartTotals, type CartLine, type DiscountType } from "../sales/sales";
import { formatPrice } from "../../lib/stock-display";
import { UnitToggle } from "./PosLines";

interface PosBillBarProps {
  lines: CartLine[];
  billValue: string;
  billType: DiscountType;
  onBillValueChange: (value: string) => void;
  onBillTypeChange: (type: DiscountType) => void;
  /** Opens the customer and payment step. */
  onCheckout: () => void;
}

/** The bar along the bottom: the bill so far, a discount on all of it, and the way into payment. */
export default function PosBillBar({
  lines,
  billValue,
  billType,
  onBillValueChange,
  onBillTypeChange,
  onCheckout,
}: PosBillBarProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const totals = cartTotals(lines, billValue, billType);
  const hasLines = lines.length > 0;
  // A custom price still to be typed means the total isn't real yet.
  const unpriced = lines.find((line) => line.customPrice && line.unitPrice <= 0);

  const figure = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
      <div style={{ ...textStyle("caption"), color: colors.inkMuted, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ ...textStyle("title3"), color: colors.ink }}>{value}</div>
    </div>
  );

  return (
    <div
      style={{
        position: "sticky",
        bottom: spacing[4],
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: spacing[10],
        rowGap: spacing[5],
        padding: `${spacing[6]}px ${spacing[8]}px`,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceRaised,
        boxShadow: elevation.md.web,
      }}
    >
      {figure(
        "Items",
        hasLines ? `${lines.length} ${lines.length === 1 ? "item" : "items"}` : "0 items",
      )}
      {figure("Subtotal", formatPrice(totals.subtotal))}

      <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
        <div
          style={{ ...textStyle("caption"), color: colors.inkMuted, textTransform: "uppercase" }}
        >
          Bill discount
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
          <div style={{ width: 96 }}>
            <Input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              aria-label="Discount on the whole bill"
              value={billValue}
              disabled={!hasLines}
              style={{ height: 36, borderColor: colors.border, textAlign: "right" }}
              onChange={(event) => {
                if (/^\d*\.?\d*$/.test(event.target.value)) onBillValueChange(event.target.value);
              }}
            />
          </div>
          <UnitToggle type={billType} onChange={onBillTypeChange} />
        </div>
      </div>

      <div
        style={{
          marginLeft: "auto",
          textAlign: "right",
          display: "flex",
          flexDirection: "column",
          gap: spacing[1],
        }}
      >
        <div
          style={{ ...textStyle("caption"), color: colors.inkMuted, textTransform: "uppercase" }}
        >
          Total
        </div>
        <div style={{ ...textStyle("title1"), color: colors.ink }}>{formatPrice(totals.total)}</div>
      </div>

      <Button
        type="button"
        variant="primary"
        disabled={!hasLines || unpriced !== undefined}
        onClick={onCheckout}
      >
        Complete sale
      </Button>
    </div>
  );
}
