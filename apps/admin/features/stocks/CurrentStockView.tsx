"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Notice, Tabs, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import {
  NEW_BATCH_ID,
  MOVEMENT_ACTIONS,
  currentBatches,
  getMovements,
  makeBatchBarcode,
  nextBatchNo,
  logMovement,
  markReversed,
  withMovements,
  type RecordedMovement,
  type StockItem,
} from "./stock-history";
import { adjustQuantity, listProducts, saveProducts, type Product, type Variant } from "./stocks";
import CurrentBatchesTab from "./CurrentBatchesTab";
import PageHeader from "../../components/PageHeader";
import PurchaseHistoryTab from "./PurchaseHistoryTab";
import RecordMovementSheet, { type MovementInput } from "./RecordMovementSheet";
import StockMovementsTab from "./StockMovementsTab";
import StockOverviewTab from "./StockOverviewTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "current", label: "Current stock" },
  { id: "purchases", label: "Purchase history" },
  { id: "movements", label: "Stock movements" },
];

/**
 * Stock for one thing you can count on the shelf: a product without variants,
 * or one variant of a product that has them.
 */
export default function CurrentStockView({
  productId,
  variantSku,
}: {
  productId: string;
  variantSku?: string;
}) {
  const { colors, spacing } = useTheme();
  const [products, setProducts] = useState<Product[] | undefined>(undefined);
  const [tab, setTab] = useState("current");
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped after each recorded movement so the log is read again.
  const [logVersion, setLogVersion] = useState(0);

  useEffect(() => {
    listProducts().then(setProducts);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const product = products?.find((row) => row.id === productId);
  const variant: Variant | undefined = variantSku
    ? product?.variants?.find((row) => row.sku === variantSku)
    : undefined;

  const item = useMemo<StockItem | null>(() => {
    if (variant) return variant;
    if (product && !product.variants) {
      return {
        sku: product.sku,
        unit: product.unit ?? "pcs",
        quantity: product.quantity,
        price: product.price,
        purchasePrice: product.purchasePrice ?? 0,
      };
    }
    return null;
  }, [product, variant]);

  const recorded = useMemo(
    () => (item ? getMovements(item.sku) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item?.sku, logVersion],
  );
  // The sample history is generated from the quantity before this session's
  // movements, so recording one doesn't reshuffle the purchases and batches.
  const stockItem = useMemo<StockItem | null>(
    () =>
      item
        ? {
            ...item,
            baseQuantity: item.quantity - recorded.reduce((sum, row) => sum + row.quantity, 0),
          }
        : null,
    [item, recorded],
  );
  const allBatches = useMemo(
    () => (stockItem ? withMovements(currentBatches(stockItem, true), recorded) : []),
    [stockItem, recorded],
  );
  const batches = useMemo(() => allBatches.filter((batch) => batch.remaining > 0), [allBatches]);

  // Moves the item's stock (and one batch's) up or down and logs it.
  function applyMovement(movement: Omit<RecordedMovement, "id" | "date" | "amount" | "sku">) {
    if (!item || !products) return;
    logMovement({
      ...movement,
      id: `recorded-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      amount: null,
      sku: item.sku,
    });
    const next = adjustQuantity(products, productId, variant?.sku, movement.quantity);
    setProducts(next);
    saveProducts(next);
    setLogVersion((version) => version + 1);
  }

  function handleRecord(input: MovementInput) {
    if (!item) return;
    const isNewBatch = input.batchId === NEW_BATCH_ID;
    const existing = allBatches.find((row) => row.id === input.batchId);
    if (!isNewBatch && !existing) return;

    // "Fix the count" is given as how many there are now; the movement is the difference.
    const quantity =
      input.action === "remove"
        ? -input.quantity
        : input.action === "add"
          ? input.quantity
          : input.quantity - (existing?.remaining ?? 0);
    const type = MOVEMENT_ACTIONS.find((row) => row.id === input.action)?.type ?? "Added";
    const note = input.note.trim();
    const reference =
      input.action === "count"
        ? `Stock count: ${existing?.remaining ?? 0} to ${input.quantity} - ${note}`
        : note;

    // Adding to "New batch" starts a batch with its own number and barcode.
    const today = new Date().toISOString().slice(0, 10);
    const salt = Date.now();
    const batchId = isNewBatch ? `${item.sku}-new-${salt}` : (existing?.id ?? "");
    const batchNo = isNewBatch ? nextBatchNo(allBatches, today) : (existing?.batchNo ?? "");

    applyMovement({
      type,
      reference,
      quantity,
      batchId,
      batchNo,
      newBatch: isNewBatch
        ? {
            barcode: makeBatchBarcode(item.sku, salt),
            receivedOn: today,
            unitCost: input.unitCost ?? item.purchasePrice,
          }
        : undefined,
    });
    setRecording(false);
    setNotice(
      isNewBatch
        ? `${input.quantity} ${item.unit} added as new batch ${batchNo}.`
        : input.action === "count"
          ? `Batch ${batchNo} counted as ${input.quantity} ${item.unit} (${quantity > 0 ? "+" : "−"}${Math.abs(quantity)}).`
          : `${input.quantity} ${item.unit} ${quantity > 0 ? "added to" : "taken out of"} batch ${batchNo}.`,
    );
  }

  // Undoing doesn't delete anything: it logs the opposite movement and marks the original.
  function handleUndo(movement: RecordedMovement) {
    const batch = allBatches.find((row) => row.id === movement.batchId);
    if (!batch || !item) return;
    if (batch.remaining - movement.quantity < 0) {
      setNotice("That can't be undone: the stock it added has already gone out.");
      return;
    }
    markReversed(movement.sku, movement.id);
    applyMovement({
      type: movement.type,
      reference: `Undo: ${movement.reference}`,
      quantity: -movement.quantity,
      batchId: movement.batchId,
      batchNo: movement.batchNo,
      isReversal: true,
    });
    setNotice(`Undone: ${movement.reference}`);
  }

  // A variant goes back to its product's variant list; anything else to Stocks.
  const backHref = product?.variants
    ? `/stocks/${encodeURIComponent(productId)}/variants`
    : "/stocks";

  const message =
    products === undefined
      ? "Loading stock..."
      : !product
        ? "We couldn't find this product."
        : product.variants && !variant
          ? "Choose a variant from the variant list to see its stock."
          : null;

  const subtitle = product
    ? `${product.category}${product.subcategory ? ` / ${product.subcategory}` : ""}${
        variant ? ` · Variant ${variant.name}` : ""
      }`
    : undefined;

  return (
    <div>
      <PageHeader
        title={product ? product.name : "Stock"}
        subtitle={subtitle}
        backHref={backHref}
        backLabel={product?.variants ? "Back to variants" : "Back to stocks"}
        action={
          item ? (
            <Button variant="primary" onClick={() => setRecording(true)}>
              Record movement
            </Button>
          ) : null
        }
      />

      {message ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          {message}
        </div>
      ) : item && stockItem ? (
        <>
          {notice ? <Notice style={{ marginBottom: spacing[4] }}>{notice}</Notice> : null}
          <div style={{ marginTop: spacing[8] }}>
            <Tabs aria-label="Stock sections" tabs={TABS} value={tab} onChange={setTab} />
          </div>
          <div role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ marginTop: spacing[8] }}>
            {tab === "overview" ? <StockOverviewTab item={stockItem} /> : null}
            {tab === "current" ? (
              <CurrentBatchesTab
                item={stockItem}
                batches={batches}
                title={
                  variant && product ? `${product.name} - ${variant.name}` : (product?.name ?? "")
                }
              />
            ) : null}
            {tab === "purchases" ? <PurchaseHistoryTab item={stockItem} /> : null}
            {tab === "movements" ? (
              <StockMovementsTab item={stockItem} recorded={recorded} onUndo={handleUndo} />
            ) : null}
          </div>
          <RecordMovementSheet
            open={recording}
            onClose={() => setRecording(false)}
            batches={allBatches}
            unit={item.unit}
            newBatchUnitCost={item.purchasePrice}
            onSubmit={handleRecord}
          />
        </>
      ) : null}
    </div>
  );
}
