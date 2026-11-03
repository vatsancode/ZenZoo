"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Input, textStyle } from "@zenzoo/ui-web";
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { searchUnits, type SellableUnit } from "../sales/sales";
import { formatPrice } from "../../lib/stock-display";

interface PosProductGridProps {
  units: SellableUnit[];
  /** Units already in the cart, so a tile can say how many. */
  inCart: Record<string, number>;
  onAdd: (unit: SellableUnit) => void;
}

type Source = "all" | "quick" | "inventory" | "made";

const SOURCES: { value: Source; label: string; matches: (unit: SellableUnit) => boolean }[] = [
  { value: "all", label: "All items", matches: () => true },
  // Priced at the till for each sale.
  { value: "quick", label: "Quick adds", matches: (unit) => unit.customPrice === true },
  { value: "inventory", label: "From inventory", matches: (unit) => !unit.service },
  { value: "made", label: "Made to order", matches: (unit) => unit.service === true },
];

/**
 * Every product as a tile, to tap into the cart. Narrow them with the chips: where an item comes
 * from (inventory, made to order, quick adds). Typing filters too (by name, SKU or category), and Enter on an
 * exact SKU adds it, so a barcode scanner works without touching the screen.
 */
export default function PosProductGrid({ units, inCart, onAdd }: PosProductGridProps) {
  const { colors, radius, spacing } = useTheme();
  const [source, setSource] = useState<Source>("all");
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  const shown = useMemo(() => {
    const matchesSource = SOURCES.find((item) => item.value === source)?.matches ?? (() => true);
    const pool = query.trim() === "" ? units : searchUnits(units, query);
    return pool.filter(matchesSource);
  }, [units, source, query]);

  function pick(unit: SellableUnit) {
    if (unit.stock <= 0) return;
    onAdd(unit);
    setAdded(unit.name);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = query.trim().toLowerCase();
    // A scanned code is an exact SKU: add it, then clear the box for the next scan.
    const exact = code ? units.find((unit) => unit.code?.toLowerCase() === code) : undefined;
    const choice = exact ?? (shown.length === 1 ? shown[0] : undefined);
    if (choice) {
      pick(choice);
      setQuery("");
    }
  }

  const chip = (selected: boolean): CSSProperties => ({
    ...textStyle("callout"),
    flex: "none",
    height: 36,
    paddingInline: spacing[4],
    borderRadius: radius.full,
    border: `1px solid ${selected ? colors.accent : colors.border}`,
    backgroundColor: selected ? colors.accent : "transparent",
    color: selected ? colors.onAccent : colors.inkMuted,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
      <Input
        id="pos-search"
        autoFocus
        autoComplete="off"
        placeholder="Scan a barcode, or search by name, SKU or category..."
        aria-label="Find a product"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        style={{ height: 52, paddingInline: spacing[5] }}
      />

      <div
        role="group"
        aria-label="Where the item comes from"
        style={{ display: "flex", gap: spacing[2], overflowX: "auto", paddingBottom: spacing[1] }}
      >
        {SOURCES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={source === item.value}
            onClick={() => setSource(item.value)}
            style={chip(source === item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Spoken to screen readers only; sighted cashiers see the count badge on the tile. */}
      <div
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {added ? `Added ${added}` : ""}
      </div>

      {shown.length === 0 ? (
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
          {units.length === 0 ? "No products to sell yet." : "Nothing matches these filters."}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
            gap: spacing[2],
          }}
        >
          {shown.map((unit) => {
            const out = unit.stock <= 0;
            const count = inCart[unit.sku] ?? 0;
            return (
              <button
                key={unit.sku}
                type="button"
                disabled={out}
                onClick={() => pick(unit)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: spacing[2],
                  minHeight: 168,
                  padding: spacing[5],
                  border: `1px solid ${count > 0 ? colors.accent : "transparent"}`,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surfaceRaised,
                  color: out ? colors.inkFaint : colors.ink,
                  textAlign: "left",
                  cursor: out ? "not-allowed" : "pointer",
                  opacity: out ? 0.6 : 1,
                }}
              >
                {count > 0 ? (
                  <span
                    style={{
                      ...textStyle("caption"),
                      position: "absolute",
                      top: spacing[2],
                      right: spacing[2],
                      minWidth: 22,
                      height: 22,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: radius.full,
                      backgroundColor: colors.accent,
                      color: colors.onAccent,
                    }}
                  >
                    {count}
                  </span>
                ) : null}
                <span
                  style={{
                    ...textStyle("headline"),
                    overflowWrap: "anywhere",
                    paddingRight: count > 0 ? spacing[6] : 0,
                  }}
                >
                  {unit.name}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
                  <span
                    style={{
                      ...textStyle("footnote"),
                      // Grey like the rest of the stock lines; only "Out of stock" is flagged.
                      color: out ? colors.danger : colors.inkMuted,
                    }}
                  >
                    {unit.service ? "Made to order" : out ? "Out of stock" : `${unit.stock} left`}
                  </span>
                  <span style={textStyle("data")}>
                    {unit.customPrice ? "Custom price" : formatPrice(unit.price)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
