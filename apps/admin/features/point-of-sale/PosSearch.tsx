"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Input, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { searchUnits, type SellableUnit } from "../sales/sales";
import { formatPrice } from "../../lib/stock-display";

interface PosSearchProps {
  units: SellableUnit[];
  /** Units already in the cart, so a row can say how many. */
  inCart: Record<string, number>;
  onAdd: (unit: SellableUnit) => void;
}

const MAX_RESULTS = 8;

/**
 * The one way to find a product: type a name, SKU or category, or scan a code.
 * Enter on an exact SKU adds it straight away, so a scanner works without touching the mouse.
 */
export default function PosSearch({ units, inCart, onAdd }: PosSearchProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchUnits(units, query).slice(0, MAX_RESULTS), [units, query]);
  const showing = open && query.trim() !== "";

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), 2500);
    return () => clearTimeout(timer);
  }, [added]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function pick(unit: SellableUnit) {
    if (unit.stock <= 0) return;
    onAdd(unit);
    setAdded(unit.name);
    setQuery("");
    setOpen(false);
    document.getElementById("pos-search")?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const code = query.trim().toLowerCase();
      // A scanned code is an exact SKU: add it without needing to pick from the list.
      const exact = units.find((unit) => unit.sku.toLowerCase() === code);
      const choice = exact ?? results[highlight];
      if (choice) pick(choice);
    } else if (event.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <Input
        id="pos-search"
        autoFocus
        autoComplete="off"
        placeholder="Scan a barcode, or search by name, SKU or category..."
        aria-label="Find a product"
        aria-expanded={showing}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{ height: 56, paddingInline: spacing[5] }}
      />
      <div
        aria-live="polite"
        style={{
          ...textStyle("footnote"),
          color: colors.success,
          minHeight: 20,
          marginTop: spacing[2],
        }}
      >
        {added ? `Added ${added}` : ""}
      </div>

      {showing ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: 60,
            left: 0,
            right: 0,
            zIndex: 10,
            padding: spacing[2],
            backgroundColor: colors.surfaceRaised,
            borderRadius: radius.lg,
            boxShadow: elevation.md.web,
          }}
        >
          {results.length === 0 ? (
            <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[5] }}>
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : (
            results.map((unit, index) => {
              const out = unit.stock <= 0;
              const count = inCart[unit.sku] ?? 0;
              return (
                <button
                  key={unit.sku}
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  disabled={out}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(unit)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing[4],
                    width: "100%",
                    minHeight: 64,
                    padding: `${spacing[2]}px ${spacing[4]}px`,
                    border: "none",
                    borderRadius: radius.md,
                    background: index === highlight && !out ? colors.surfaceSunken : "transparent",
                    color: out ? colors.inkFaint : colors.ink,
                    textAlign: "left",
                    cursor: out ? "not-allowed" : "pointer",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={textStyle("bodyMedium")}>{unit.name}</div>
                    <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      <span style={textStyle("dataSmall")}>{unit.sku}</span> · {unit.category}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div style={textStyle("data")}>
                      {unit.customPrice ? "Custom price" : formatPrice(unit.price)}
                    </div>
                    <div
                      style={{
                        ...textStyle("footnote"),
                        color: unit.service
                          ? colors.inkMuted
                          : out
                            ? colors.danger
                            : unit.stock <= 10
                              ? colors.warning
                              : colors.inkMuted,
                      }}
                    >
                      {unit.service ? "Service" : out ? "Out of stock" : `${unit.stock} left`}
                      {count > 0 ? ` · ${count} in cart` : ""}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
