"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import PosCheckout from "./PosCheckout";
import PosLines from "./PosLines";
import PosNotices from "./PosNotices";
import PosSaleComplete from "./PosSaleComplete";
import PosSearch from "./PosSearch";
import { usePosSale } from "./usePosSale";

/** The point of sale, layout 1: search for a product, a cart table, and the checkout beside it. */
export default function PosScreen() {
  const { spacing } = useTheme();
  const sale = usePosSale();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <h1 style={{ ...textStyle("title1"), margin: 0 }}>Point of Sale</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: spacing[6],
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
          <PosNotices
            loadError={sale.loadError}
            changes={sale.changes}
            onDismissChanges={sale.dismissChanges}
          />
          <PosSaleComplete
            sale={sale.finished}
            change={sale.change}
            onDismiss={sale.dismissFinished}
          />
          <PosSearch units={sale.units} inCart={sale.inCart} onAdd={sale.addToCart} />
          <PosLines
            lines={sale.lines}
            onLineChange={sale.changeLine}
            onRemove={sale.removeLine}
            onClear={sale.clearLines}
          />
        </div>
        <PosCheckout
          key={sale.saleCount}
          lines={sale.lines}
          customers={sale.customers}
          paymentOptions={sale.paymentOptions}
          onNewCustomer={sale.addCustomer}
          creditBalanceOf={sale.creditBalanceOf}
          dueBalanceOf={sale.dueBalanceOf}
          onComplete={sale.complete}
        />
      </div>
    </div>
  );
}
