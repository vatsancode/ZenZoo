"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import { useEffect } from "react";
import { formatPrice } from "../../lib/stock-display";
import type { Sale } from "../sales/sales";

interface PosSaleCompleteProps {
  /** The sale just saved, or null while none is being shown. */
  sale: Sale | null;
  /** Change handed back to the customer, in rupees. */
  change: number;
  onDismiss: () => void;
}

/** A line above the cart confirming the last sale; the next sale is already open underneath. */
export default function PosSaleComplete({ sale, change, onDismiss }: PosSaleCompleteProps) {
  const { colors, radius, spacing } = useTheme();

  // Keep it up long enough to hand over the change, then clear it away.
  useEffect(() => {
    if (!sale) return;
    const timer = setTimeout(onDismiss, 15000);
    return () => clearTimeout(timer);
  }, [sale, onDismiss]);

  if (!sale) return null;
  return (
    <div
      role="status"
      style={{
        ...textStyle("callout"),
        color: colors.ink,
        backgroundColor: colors.surfaceSunken,
        border: `1px solid ${colors.success}`,
        borderRadius: radius.md,
        padding: spacing[4],
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: spacing[4],
      }}
    >
      <span>
        <span style={{ color: colors.success }}>Sale {sale.number} saved</span> ·{" "}
        {formatPrice(sale.total)}
        {change > 0 ? ` · Give back ${formatPrice(change)}` : ""}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          ...textStyle("callout"),
          border: "none",
          background: "transparent",
          color: colors.inkMuted,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
