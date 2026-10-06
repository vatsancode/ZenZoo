"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Product } from "../stocks/stocks";

export interface PickedItem {
  sku: string;
  quantity: number;
}

interface ProductPickerProps {
  products: Product[];
  /** SKUs already on the purchase; shown as added and not pickable again. */
  addedSkus: string[];
  /** Called with every product or variant given a quantity, when the user confirms. */
  onPickMany: (items: PickedItem[]) => void;
  /** Called when the user wants a new variant under an existing product. */
  onAddVariant: (product: Product) => void;
}

/**
 * A searchable list grouped by product. Each product or variant takes a
 * quantity right in the list, so several can be added to the purchase at once.
 */
export default function ProductPicker({
  products,
  addedSkus,
  onPickMany,
  onAddVariant,
}: ProductPickerProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  // Quantity typed for each SKU, not yet added to the purchase - the "cart".
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  // The row the pointer is over, so it can lift slightly.
  const [hovered, setHovered] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // A product whose own name matches shows all its variants; otherwise only the matching ones.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .map((product) => {
        const variants = product.variants ?? [];
        const productMatches =
          !q ||
          product.name.toLowerCase().includes(q) ||
          product.category.toLowerCase().includes(q) ||
          product.sku.toLowerCase().includes(q);
        const shown = productMatches
          ? variants
          : variants.filter(
              (variant) =>
                variant.name.toLowerCase().includes(q) || variant.sku.toLowerCase().includes(q),
            );
        return { product, variants: shown, visible: productMatches || shown.length > 0 };
      })
      .filter((group) => group.visible);
  }, [products, query]);

  const searching = query.trim() !== "";
  const quantityOf = (sku: string) => Number(quantities[sku] ?? 0) || 0;
  const picked: PickedItem[] = Object.keys(quantities)
    .filter((sku) => quantityOf(sku) > 0)
    .map((sku) => ({ sku, quantity: quantityOf(sku) }));
  const totalUnits = picked.reduce((sum, item) => sum + item.quantity, 0);

  function toggle(id: string) {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function setQuantity(sku: string, value: string) {
    // Digits and one decimal point only; an empty box means "not picked".
    if (!/^\d*\.?\d*$/.test(value)) return;
    setQuantities((current) => ({ ...current, [sku]: value }));
  }

  function step(sku: string, by: number) {
    const next = Math.max(0, Math.round((quantityOf(sku) + by) * 100) / 100);
    setQuantities((current) => ({ ...current, [sku]: next === 0 ? "" : String(next) }));
  }

  function confirm() {
    onPickMany(picked);
    setQuantities({});
    setOpen(false);
    setQuery("");
  }

  /**
   * One row shape for everything in the list. A picked row gets a soft fill and
   * a short accent tick beside it (see pickMark); the fill is lighter inside the variants
   * panel because the panel itself is already recessed.
   */
  const rowStyle = (
    key: string,
    state: { picked?: boolean; disabled?: boolean; inPanel?: boolean } = {},
  ): CSSProperties => {
    const { picked: isPicked = false, disabled = false, inPanel = false } = state;
    const lifted = inPanel ? colors.surfaceRaised : colors.surfaceSunken;
    return {
      ...textStyle("body"),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing[5],
      width: "100%",
      minHeight: 64,
      padding: `${spacing[3]}px ${spacing[6]}px`,
      border: "none",
      borderRadius: radius.md,
      boxSizing: "border-box",
      position: "relative",
      background: isPicked || (hovered === key && !disabled) ? lifted : "transparent",
      color: disabled ? colors.inkFaint : colors.ink,
      textAlign: "left",
      transition: "background-color 120ms ease",
    };
  };

  // A short straight tick, inset from the row's edge, so it doesn't follow the row's rounded corners.
  const pickMark = (isPicked: boolean) =>
    isPicked ? (
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: spacing[3],
          top: "50%",
          width: 3,
          height: 24,
          marginTop: -12,
          borderRadius: 1,
          backgroundColor: colors.accent,
        }}
      />
    ) : null;

  const hoverProps = (key: string) => ({
    onMouseEnter: () => setHovered(key),
    onMouseLeave: () => setHovered((current) => (current === key ? null : current)),
  });

  const stepButton = (label: string, aria: string, onClick: () => void) => (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
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

  // The one control on each row: a pill counter for how many to buy.
  const counter = (sku: string, name: string, inPanel: boolean) => (
    <span onClick={(event) => event.stopPropagation()}>{counterControl(sku, name, inPanel)}</span>
  );

  const counterControl = (sku: string, name: string, inPanel: boolean) => {
    const pill = inPanel ? colors.surfaceSunken : colors.surfaceRaised;
    if (quantities[sku] === undefined || quantities[sku] === "") {
      return (
        <button
          type="button"
          aria-label={`Add ${name}`}
          onClick={() => step(sku, 1)}
          style={{
            ...textStyle("bodyMedium"),
            height: 32,
            paddingInline: spacing[5],
            border: `1px solid ${colors.border}`,
            borderRadius: radius.full,
            backgroundColor: "transparent",
            color: colors.ink,
            cursor: "pointer",
          }}
        >
          Add
        </button>
      );
    }
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: 2,
          borderRadius: radius.full,
          backgroundColor: pill,
          border: `1px solid ${colors.border}`,
        }}
      >
        {stepButton("−", `Decrease ${name}`, () => step(sku, -1))}
        <input
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Quantity of ${name}`}
          value={quantities[sku] ?? ""}
          onChange={(event) => setQuantity(sku, event.target.value)}
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
        {stepButton("+", `Increase ${name}`, () => step(sku, 1))}
      </div>
    );
  };

  const nameBlock = (name: string, detail: string) => (
    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 2 }}>
      <span style={textStyle("bodyMedium")}>{name}</span>
      <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{detail}</span>
    </span>
  );

  return (
    <div ref={rootRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...textStyle("body"),
          width: "100%",
          height: 44,
          padding: `0 ${spacing[4]}px`,
          border: "none",
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSunken,
          color: colors.inkFaint,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        Search and add a product or variant
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: colors.surfaceRaised,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            boxShadow: elevation.md.web,
            padding: spacing[6],
          }}
        >
          <Input
            autoFocus
            type="search"
            autoComplete="off"
            placeholder="Search products, variants, SKUs..."
            aria-label="Search products and variants"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div
            style={{
              maxHeight: 440,
              overflowY: "auto",
              // A slim, theme-coloured scrollbar instead of the browser's bright default.
              scrollbarWidth: "thin",
              scrollbarColor: `${colors.border} transparent`,
              scrollbarGutter: "stable",
              paddingRight: spacing[1],
              marginTop: spacing[5],
              display: "flex",
              flexDirection: "column",
              gap: spacing[2],
            }}
          >
            {groups.length === 0 ? (
              <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[4] }}>
                No products match your search.
              </div>
            ) : null}

            {groups.map(({ product, variants }) => {
              const count = product.variants?.length ?? 0;
              // Searching opens every matching product so its variants are visible.
              const expanded = searching || openIds.includes(product.id);
              const chosen = (product.variants ?? []).filter(
                (variant) => quantityOf(variant.sku) > 0,
              ).length;
              const simpleAdded = count === 0 && addedSkus.includes(product.sku);
              return (
                <div key={product.id}>
                  {count > 0 ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggle(product.id)}
                      {...hoverProps(product.id)}
                      style={{ ...rowStyle(product.id, { picked: chosen > 0 }), cursor: "pointer" }}
                    >
                      {pickMark(chosen > 0)}
                      {nameBlock(
                        product.name,
                        `${product.category} · ${count} ${count === 1 ? "variant" : "variants"}`,
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
                        {chosen > 0 ? (
                          <span
                            title={`${chosen} selected`}
                            style={{
                              ...textStyle("caption"),
                              minWidth: 22,
                              height: 22,
                              padding: `0 ${spacing[2]}px`,
                              boxSizing: "border-box",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: radius.full,
                              backgroundColor: colors.accent,
                              color: colors.onAccent,
                            }}
                          >
                            {chosen}
                          </span>
                        ) : null}
                        <span
                          aria-hidden="true"
                          style={{
                            ...textStyle("body"),
                            color: colors.inkMuted,
                            transform: expanded ? "rotate(90deg)" : "none",
                            transition: "transform 120ms ease",
                          }}
                        >
                          ›
                        </span>
                      </span>
                    </button>
                  ) : (
                    <div
                      {...hoverProps(product.id)}
                      onClick={() => {
                        if (!simpleAdded && quantityOf(product.sku) === 0) step(product.sku, 1);
                      }}
                      style={{
                        ...rowStyle(product.id, {
                          picked: quantityOf(product.sku) > 0,
                          disabled: simpleAdded,
                        }),
                        cursor: simpleAdded ? "default" : "pointer",
                      }}
                    >
                      {pickMark(quantityOf(product.sku) > 0)}
                      {nameBlock(product.name, `${product.category} · ${product.sku}`)}
                      {simpleAdded ? (
                        <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                          Added
                        </span>
                      ) : (
                        counter(product.sku, product.name, false)
                      )}
                    </div>
                  )}

                  {count > 0 && expanded ? (
                    <div
                      style={{
                        margin: `${spacing[2]}px ${spacing[4]}px ${spacing[3]}px`,
                        padding: spacing[3],
                        backgroundColor: colors.surfaceSunken,
                        borderRadius: radius.md,
                        display: "flex",
                        flexDirection: "column",
                        gap: spacing[1],
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setQuery("");
                          onAddVariant(product);
                        }}
                        style={{
                          ...textStyle("bodyMedium"),
                          height: 44,
                          marginBottom: spacing[2],
                          border: `1px dashed ${colors.border}`,
                          borderRadius: radius.md,
                          background: "transparent",
                          color: colors.inkMuted,
                          cursor: "pointer",
                        }}
                      >
                        + Add new variant
                      </button>
                      {variants.map((variant) => {
                        const added = addedSkus.includes(variant.sku);
                        return (
                          <div
                            key={variant.sku}
                            {...hoverProps(variant.sku)}
                            onClick={() => {
                              if (!added && quantityOf(variant.sku) === 0) step(variant.sku, 1);
                            }}
                            style={{
                              cursor: added ? "default" : "pointer",
                              ...rowStyle(variant.sku, {
                                picked: quantityOf(variant.sku) > 0,
                                disabled: added,
                                inPanel: true,
                              }),
                              minHeight: 60,
                            }}
                          >
                            {pickMark(quantityOf(variant.sku) > 0)}
                            <span
                              style={{ display: "flex", alignItems: "baseline", gap: spacing[3] }}
                            >
                              <span style={textStyle("bodyMedium")}>{variant.name}</span>
                              <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                                {variant.sku}
                              </span>
                            </span>
                            {added ? (
                              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                                Added
                              </span>
                            ) : (
                              counter(variant.sku, `${product.name} ${variant.name}`, true)
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[4],
              marginTop: spacing[5],
              paddingTop: spacing[5],
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
              {picked.length === 0 ? (
                "Set a quantity for each item you want to buy"
              ) : (
                <>
                  <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                    {picked.length} {picked.length === 1 ? "item" : "items"}
                  </span>
                  {` · ${totalUnits} in total`}
                </>
              )}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
              {picked.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setQuantities({})}
                  style={{
                    ...textStyle("bodyMedium"),
                    height: 44,
                    paddingInline: spacing[4],
                    border: "none",
                    background: "transparent",
                    color: colors.inkMuted,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              ) : null}
              <Button
                type="button"
                variant="primary"
                disabled={picked.length === 0}
                onClick={confirm}
              >
                {picked.length > 0 ? `Add ${picked.length} to purchase` : "Add to purchase"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
