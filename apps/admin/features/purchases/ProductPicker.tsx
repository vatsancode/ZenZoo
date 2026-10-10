"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RealProduct } from "../../lib/realProducts";

export interface PickedItem {
  variantId: string;
  quantity: number;
}

interface ProductPickerProps {
  products: RealProduct[];
  /** Variant ids already on the purchase; shown as added and not pickable again. */
  addedVariantIds: string[];
  /** Called with every variant given a quantity, when the user confirms. */
  onPickMany: (items: PickedItem[]) => void;
}

/**
 * A searchable list grouped by product. Every real product always has at
 * least one variant - there's no "simple product with its own SKU" branch
 * here the way the mock had, since that distinction never existed below
 * the variant level (see createProduct's own note: the toggle is UI
 * presentation, not a second schema shape).
 */
export default function ProductPicker({ products, addedVariantIds, onPickMany }: ProductPickerProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  // Quantity typed for each variant id, not yet added to the purchase - the "cart".
  const [quantities, setQuantities] = useState<Record<string, string>>({});
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

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((product) => product.status === "active")
      .map((product) => {
        const variants = product.variants.filter((variant) => variant.status === "active");
        const productMatches = !q || product.name.toLowerCase().includes(q);
        const shown = productMatches
          ? variants
          : variants.filter(
              (variant) =>
                variant.name.toLowerCase().includes(q) ||
                (variant.sku ?? "").toLowerCase().includes(q),
            );
        return { product, variants: shown, visible: productMatches || shown.length > 0 };
      })
      .filter((group) => group.visible);
  }, [products, query]);

  const searching = query.trim() !== "";
  const quantityOf = (variantId: string) => Number(quantities[variantId] ?? 0) || 0;
  const picked: PickedItem[] = Object.keys(quantities)
    .filter((variantId) => quantityOf(variantId) > 0)
    .map((variantId) => ({ variantId, quantity: quantityOf(variantId) }));
  const totalUnits = picked.reduce((sum, item) => sum + item.quantity, 0);

  function toggle(id: string) {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function setQuantity(variantId: string, value: string) {
    if (!/^\d*\.?\d*$/.test(value)) return;
    setQuantities((current) => ({ ...current, [variantId]: value }));
  }

  function step(variantId: string, by: number) {
    const next = Math.max(0, Math.round((quantityOf(variantId) + by) * 100) / 100);
    setQuantities((current) => ({ ...current, [variantId]: next === 0 ? "" : String(next) }));
  }

  function confirm() {
    onPickMany(picked);
    setQuantities({});
    setOpen(false);
    setQuery("");
  }

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

  const counter = (variantId: string, name: string, inPanel: boolean) => (
    <span onClick={(event) => event.stopPropagation()}>
      {counterControl(variantId, name, inPanel)}
    </span>
  );

  const counterControl = (variantId: string, name: string, inPanel: boolean) => {
    const pill = inPanel ? colors.surfaceSunken : colors.surfaceRaised;
    if (quantities[variantId] === undefined || quantities[variantId] === "") {
      return (
        <button
          type="button"
          aria-label={`Add ${name}`}
          onClick={() => step(variantId, 1)}
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
        {stepButton("−", `Decrease ${name}`, () => step(variantId, -1))}
        <input
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Quantity of ${name}`}
          value={quantities[variantId] ?? ""}
          onChange={(event) => setQuantity(variantId, event.target.value)}
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
        {stepButton("+", `Increase ${name}`, () => step(variantId, 1))}
      </div>
    );
  };

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
              const count = product.variants.filter((v) => v.status === "active").length;
              const expanded = searching || openIds.includes(product.id);
              const chosen = variants.filter((variant) => quantityOf(variant.id) > 0).length;
              return (
                <div key={product.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggle(product.id)}
                    {...hoverProps(product.id)}
                    style={{ ...rowStyle(product.id, { picked: chosen > 0 }), cursor: "pointer" }}
                  >
                    {pickMark(chosen > 0)}
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 2 }}>
                      <span style={textStyle("bodyMedium")}>{product.name}</span>
                      <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                        {count} {count === 1 ? "variant" : "variants"}
                      </span>
                    </span>
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

                  {expanded ? (
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
                      {variants.map((variant) => {
                        const added = addedVariantIds.includes(variant.id);
                        return (
                          <div
                            key={variant.id}
                            {...hoverProps(variant.id)}
                            onClick={() => {
                              if (!added && quantityOf(variant.id) === 0) step(variant.id, 1);
                            }}
                            style={{
                              cursor: added ? "default" : "pointer",
                              ...rowStyle(variant.id, {
                                picked: quantityOf(variant.id) > 0,
                                disabled: added,
                                inPanel: true,
                              }),
                              minHeight: 60,
                            }}
                          >
                            {pickMark(quantityOf(variant.id) > 0)}
                            <span
                              style={{ display: "flex", alignItems: "baseline", gap: spacing[3] }}
                            >
                              <span style={textStyle("bodyMedium")}>{variant.name}</span>
                              {variant.sku ? (
                                <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                                  {variant.sku}
                                </span>
                              ) : null}
                            </span>
                            {added ? (
                              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                                Added
                              </span>
                            ) : (
                              counter(variant.id, `${product.name} ${variant.name}`, true)
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
