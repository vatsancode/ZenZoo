"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Card, Icon, IconButton, Input, textStyle } from "@zenzoo/ui-web";
import { addQuantities } from "@zenzoo/pricing";
import { useState } from "react";
import { lineDiscount, lineNet, type CartLine } from "../sales/sales";
import { formatPrice } from "../../lib/stock-display";
import { UnitToggle } from "./PosLines";
import QuantityStepper from "./QuantityStepper";

interface PosCartPanelProps {
  lines: CartLine[];
  onLineChange: (sku: string, patch: Partial<CartLine>) => void;
  onRemove: (sku: string) => void;
  onClear: () => void;
}

/**
 * The cart as a narrow list, one line per item: its quantity, name and total. Click a line to open
 * it and change the quantity, type a price (for a custom-priced item) or give it a discount.
 */
export default function PosCartPanel({
  lines,
  onLineChange,
  onRemove,
  onClear,
}: PosCartPanelProps) {
  const { colors, radius, spacing } = useTheme();
  const [openSku, setOpenSku] = useState<string | null>(null);
  const units = addQuantities(...lines.map((line) => line.quantity));

  return (
    <Card>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: spacing[4],
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
            padding: `${spacing[8]}px ${spacing[4]}px`,
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.lg,
          }}
        >
          Nothing in the cart yet. Tap a product to add it.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
          {lines.map((line) => {
            const off = lineDiscount(line);
            // A price still to be typed keeps its line open, so it can't be missed.
            const needsPrice = line.customPrice === true && line.unitPrice <= 0;
            const open = openSku === line.sku || needsPrice;
            return (
              <div
                key={line.sku}
                style={{
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSunken,
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={`${open ? "Close" : "Edit"} ${line.name}`}
                    onClick={() => setOpenSku(openSku === line.sku ? null : line.sku)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: spacing[3],
                      flex: 1,
                      minWidth: 0,
                      minHeight: 68,
                      padding: `${spacing[3]}px ${spacing[4]}px`,
                      border: "none",
                      background: "transparent",
                      color: colors.ink,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        ...textStyle("data"),
                        flex: "none",
                        minWidth: 28,
                        color: colors.inkMuted,
                      }}
                    >
                      {line.quantity}×
                    </span>
                    <span
                      style={{
                        ...textStyle("bodyMedium"),
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {line.name}
                    </span>
                    <span style={{ flex: "none", textAlign: "right" }}>
                      <span style={{ ...textStyle("data"), display: "block" }}>
                        {formatPrice(lineNet(line))}
                      </span>
                      {off > 0 ? (
                        <span
                          style={{
                            ...textStyle("caption"),
                            display: "block",
                            color: colors.warning,
                          }}
                        >
                          - {formatPrice(off)}
                        </span>
                      ) : null}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-flex",
                        color: colors.inkMuted,
                        transform: open ? "rotate(180deg)" : "none",
                      }}
                    >
                      <Icon name="chevronDown" size={16} />
                    </span>
                  </button>
                  <IconButton
                    icon="close"
                    label={`Remove ${line.name}`}
                    onClick={() => onRemove(line.sku)}
                  />
                </div>

                {open ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: spacing[3],
                      padding: `${spacing[1]}px ${spacing[3]}px ${spacing[3]}px`,
                    }}
                  >
                    <QuantityStepper
                      line={line}
                      onChange={(patch) => onLineChange(line.sku, patch)}
                      onRemove={() => onRemove(line.sku)}
                    />

                    {line.customPrice ? (
                      <div style={{ width: 96 }}>
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
                                unitPrice:
                                  event.target.value === "" ? 0 : Number(event.target.value),
                              });
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                        {formatPrice(line.unitPrice)} each
                      </span>
                    )}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: spacing[2],
                        marginLeft: "auto",
                      }}
                    >
                      <div style={{ width: 96 }}>
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Discount"
                          aria-label={`Discount on ${line.name}`}
                          value={line.discountValue}
                          style={{ height: 36, borderColor: colors.border }}
                          onChange={(event) => {
                            if (/^\d*\.?\d*$/.test(event.target.value)) {
                              onLineChange(line.sku, { discountValue: event.target.value });
                            }
                          }}
                        />
                      </div>
                      <UnitToggle
                        type={line.discountType}
                        onChange={(discountType) => onLineChange(line.sku, { discountType })}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
