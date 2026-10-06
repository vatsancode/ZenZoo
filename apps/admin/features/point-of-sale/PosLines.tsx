"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Card, IconButton, Input, textStyle } from "@zenzoo/ui-web";
import { useState } from "react";
import {
  lineDiscount,
  lineNet,
  lineProfit,
  type CartLine,
  type DiscountType,
} from "../sales/sales";
import { formatPrice } from "../../lib/stock-display";
import InfoTip from "../../components/InfoTip";
import ProfitBreakdown from "./ProfitBreakdown";

/** A rupee / percent toggle that sits beside a discount box. */
export function UnitToggle({
  type,
  onChange,
}: {
  type: DiscountType;
  onChange: (type: DiscountType) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <button
      type="button"
      aria-label={
        type === "amount"
          ? "Discount in rupees. Switch to percent"
          : "Discount in percent. Switch to rupees"
      }
      onClick={() => onChange(type === "amount" ? "percent" : "amount")}
      style={{
        ...textStyle("bodyMedium"),
        width: 40,
        height: 36,
        flex: "none",
        border: `1px solid ${colors.border}`,
        borderRadius: radius.full,
        background: "transparent",
        color: colors.ink,
        cursor: "pointer",
        padding: `0 ${spacing[1]}px`,
      }}
    >
      {type === "amount" ? "₹" : "%"}
    </button>
  );
}

interface PosLinesProps {
  lines: CartLine[];
  onLineChange: (sku: string, patch: Partial<CartLine>) => void;
  onRemove: (sku: string) => void;
  onClear: () => void;
}

// Columns: item, quantity, price, discount, total, remove.
const COLUMNS = "minmax(0, 1fr) 128px 96px 160px 112px 36px";

/** Everything in the sale so far, one row per item, with its quantity and its own discount. */
export default function PosLines({ lines, onLineChange, onRemove, onClear }: PosLinesProps) {
  const { colors, radius, spacing } = useTheme();
  const [hovered, setHovered] = useState<string | null>(null);
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);

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
    <Card>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: spacing[5],
        }}
      >
        <div style={{ ...textStyle("headline"), color: colors.ink }}>
          Cart
          {lines.length > 0 ? (
            <span
              style={{ ...textStyle("footnote"), color: colors.inkMuted, marginLeft: spacing[3] }}
            >
              {lines.length} {lines.length === 1 ? "item" : "items"} · {units}{" "}
              {units === 1 ? "unit" : "units"}
            </span>
          ) : null}
        </div>
        {lines.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            style={{
              ...textStyle("bodyMedium"),
              padding: 0,
              border: "none",
              background: "transparent",
              color: colors.inkMuted,
              cursor: "pointer",
            }}
          >
            Clear cart
          </button>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <div
          style={{
            ...textStyle("callout"),
            color: colors.inkMuted,
            textAlign: "center",
            padding: `${spacing[12]}px ${spacing[4]}px`,
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.lg,
          }}
        >
          Nothing in the cart yet. Scan a barcode or search above to add the first item.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: COLUMNS,
              columnGap: spacing[3],
              padding: `0 ${spacing[4]}px ${spacing[2]}px`,
              ...textStyle("caption"),
              color: colors.inkMuted,
            }}
          >
            <span>ITEM</span>
            <span>QTY</span>
            <span>PRICE</span>
            <span>DISCOUNT</span>
            <span style={{ textAlign: "right" }}>TOTAL</span>
            <span />
          </div>

          {lines.map((line) => {
            const off = lineDiscount(line);
            return (
              <div
                key={line.sku}
                onMouseEnter={() => setHovered(line.sku)}
                onMouseLeave={() =>
                  setHovered((current) => (current === line.sku ? null : current))
                }
                style={{
                  display: "grid",
                  gridTemplateColumns: COLUMNS,
                  columnGap: spacing[3],
                  alignItems: "center",
                  minHeight: 72,
                  padding: `${spacing[3]}px ${spacing[4]}px`,
                  borderRadius: radius.lg,
                  backgroundColor:
                    hovered === line.sku
                      ? `color-mix(in srgb, ${colors.ink} 5%, transparent)`
                      : "transparent",
                  transition: "background-color 120ms ease",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{line.name}</div>
                  <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                    {line.service ? "Service" : line.sku}
                  </div>
                </div>

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
                      ? onRemove(line.sku)
                      : onLineChange(line.sku, { quantity: line.quantity - 1 }),
                  )}
                  <span
                    style={{
                      ...textStyle("data"),
                      width: 32,
                      textAlign: "center",
                      color: colors.ink,
                    }}
                  >
                    {line.quantity}
                  </span>
                  {stepButton(
                    "+",
                    `Increase ${line.name}`,
                    () => onLineChange(line.sku, { quantity: line.quantity + 1 }),
                    line.quantity >= line.stock,
                  )}
                </div>

                {line.customPrice ? (
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Price"
                    aria-label={`Price of ${line.name}`}
                    value={line.priceValue ?? ""}
                    aria-invalid={line.unitPrice <= 0 ? true : undefined}
                    style={{ height: 36, borderColor: colors.border }}
                    onChange={(event) => {
                      if (/^\d*\.?\d*$/.test(event.target.value)) {
                        onLineChange(line.sku, {
                          priceValue: event.target.value,
                          unitPrice: event.target.value === "" ? 0 : Number(event.target.value),
                        });
                      }
                    }}
                  />
                ) : (
                  <span style={textStyle("data")}>{formatPrice(line.unitPrice)}</span>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    aria-label={`Discount on ${line.name}`}
                    value={line.discountValue}
                    style={{ height: 36, borderColor: colors.border }}
                    onChange={(event) => {
                      if (/^\d*\.?\d*$/.test(event.target.value)) {
                        onLineChange(line.sku, { discountValue: event.target.value });
                      }
                    }}
                  />
                  <UnitToggle
                    type={line.discountType}
                    onChange={(discountType) => onLineChange(line.sku, { discountType })}
                  />
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      ...textStyle("data"),
                      color: colors.ink,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: spacing[2],
                    }}
                  >
                    <InfoTip
                      label={`Profit on ${line.name}`}
                      mode="click"
                      align="right"
                      width={260}
                    >
                      <ProfitBreakdown
                        title="Profit on this item"
                        profit={lineProfit(line)}
                        note="After this item's discount."
                      />
                    </InfoTip>
                    {formatPrice(lineNet(line))}
                  </div>
                  {off > 0 ? (
                    <div style={{ ...textStyle("footnote"), color: colors.warning }}>
                      - {formatPrice(off)}
                    </div>
                  ) : null}
                </div>

                <IconButton
                  icon="close"
                  label={`Remove ${line.name}`}
                  onClick={() => onRemove(line.sku)}
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
