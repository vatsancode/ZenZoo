"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { IconButton, Modal, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import type { DiscountType } from "../sales/sales";
import PosBillBar from "./PosBillBar";
import PosCartPanel from "./PosCartPanel";
import PosCheckout from "./PosCheckout";
import PosNotices from "./PosNotices";
import PosProductGrid from "./PosProductGrid";
import PosSaleComplete from "./PosSaleComplete";
import { usePosSale } from "./usePosSale";

/**
 * The point of sale, layout 2: the whole catalogue as tiles to tap, narrowed by chips, the cart
 * beside it, and a bar along the bottom with the bill. "Complete sale" opens the customer and
 * payment step, where a bill can be paid one way or split across several.
 */
export default function PosScreenLayout2() {
  const { colors, spacing } = useTheme();
  const sale = usePosSale();
  const [billValue, setBillValue] = useState("");
  const [billType, setBillType] = useState<DiscountType>("amount");
  const [checkingOut, setCheckingOut] = useState(false);

  // Once the sale is saved the receipt takes over, and the next sale starts without a discount.
  useEffect(() => {
    if (sale.finished) setCheckingOut(false);
  }, [sale.finished]);
  useEffect(() => {
    if (sale.lines.length === 0) {
      setCheckingOut(false);
      setBillValue("");
      setBillType("amount");
    }
  }, [sale.lines.length]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing[6],
        // Fill the screen, so the bill bar rests at the bottom even when there are few products.
        minHeight: `calc(100vh - ${spacing[10] * 2}px)`,
      }}
    >
      <h1 style={{ ...textStyle("title1"), margin: 0 }}>Point of Sale</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 400px",
          gap: spacing[6],
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[3], minWidth: 0 }}>
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
          <PosProductGrid units={sale.units} inCart={sale.inCart} onAdd={sale.addToCart} />
        </div>

        <div style={{ position: "sticky", top: spacing[6] }}>
          <PosCartPanel
            lines={sale.lines}
            onLineChange={sale.changeLine}
            onRemove={sale.removeLine}
            onClear={sale.clearLines}
          />
        </div>
      </div>

      <div style={{ marginTop: "auto" }}>
        <PosBillBar
          lines={sale.lines}
          billValue={billValue}
          billType={billType}
          onBillValueChange={setBillValue}
          onBillTypeChange={setBillType}
          onCheckout={() => setCheckingOut(true)}
        />
      </div>

      <Modal open={checkingOut} onClose={() => setCheckingOut(false)}>
        <div style={{ width: 480, maxWidth: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: spacing[5],
            }}
          >
            <div style={{ ...textStyle("title3"), color: colors.ink }}>Complete sale</div>
            <IconButton
              icon="close"
              label="Back to the cart"
              onClick={() => setCheckingOut(false)}
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
            bill={{ value: billValue, type: billType }}
          />
        </div>
      </Modal>
    </div>
  );
}
