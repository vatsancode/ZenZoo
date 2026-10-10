"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Notice, Tabs, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import {
  MOVEMENT_ACTIONS,
  NEW_BATCH_ID,
  makeBatchBarcode,
  nextBatchNo,
  type Batch,
  type Movement,
  type RecordedMovement,
  type StockItem,
} from "./stock-history";
import { listRealProducts, type RealProduct } from "../../lib/realProducts";
import { listCurrentStock, listInventoryBatches, listStockMovements } from "../../lib/realStock";
import { listPurchases, purchaseLinesForVariant, type Purchase } from "../purchases/purchases";
import { listVendors, type Vendor } from "../vendors/vendors";
import { today } from "../../lib/date-ranges";
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
 * Stock for one real variant. Overview/Batches/Purchases/Movements all show
 * real data (inventory_batches, stock_movements, purchase_items). Record
 * Movement still opens and "works," but only against this screen's own
 * local state - it was never wired to a real write capability, and nothing
 * here changes that; see handleRecord's own note.
 */
export default function CurrentStockView({
  productId,
  variantId,
}: {
  productId: string;
  variantId?: string;
}) {
  const { colors, spacing } = useTheme();
  const [products, setProducts] = useState<RealProduct[] | undefined>(undefined);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [allPurchases, setAllPurchases] = useState<Purchase[]>([]);
  const [realMovements, setRealMovements] = useState<Movement[]>([]);
  const [lastPurchaseDate, setLastPurchaseDate] = useState<string | null>(null);

  const [tab, setTab] = useState("current");
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Local-only: seeded from real data once it loads, then mutated purely on
  // screen by Record Movement. Never written back to the server.
  const [localQuantity, setLocalQuantity] = useState<number | null>(null);
  const [localBatches, setLocalBatches] = useState<Batch[]>([]);
  const [recorded, setRecorded] = useState<RecordedMovement[]>([]);

  useEffect(() => {
    listRealProducts().then(setProducts);
    listCurrentStock().then(setStockMap);
    listVendors().then(setVendors);
    listPurchases().then(setAllPurchases);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const product = products?.find((row) => row.id === productId);
  const variant = variantId ? product?.variants.find((row) => row.id === variantId) : undefined;

  // Seed local state from real data exactly once per variant.
  useEffect(() => {
    if (!variant) return;
    setLocalQuantity(stockMap[variant.id] ?? 0);
    setRecorded([]);
    listInventoryBatches(variant.id).then((batches) => {
      setLocalBatches(
        batches.map((batch) => ({
          id: batch.id,
          batchNo: `B${batch.receivedAt.slice(2, 10).replaceAll("-", "")}`,
          barcode: batch.barcode,
          receivedOn: batch.receivedAt.slice(0, 10),
          received: batch.receivedQuantity,
          remaining: batch.availableQuantity,
          unitCost: Number(batch.unitCost),
        })),
      );
    });
    listStockMovements(variant.id).then((movements) => {
      setRealMovements(
        movements.map((movement) => ({
          id: movement.id,
          date: movement.occurredAt.slice(0, 10),
          type: "Purchased",
          reference: movement.referenceType ?? "-",
          quantity: movement.quantity,
          amount: null,
        })),
      );
      setLastPurchaseDate(movements[0]?.occurredAt.slice(0, 10) ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id, stockMap]);

  const purchaseLines = useMemo(
    () => (variant ? purchaseLinesForVariant(allPurchases, variant.id) : []),
    [allPurchases, variant],
  );
  const supplierName = (supplierId: string) =>
    vendors.find((row) => row.id === supplierId)?.name ?? "Unknown vendor";

  const latestUnitCost = localBatches[0]?.unitCost ?? 0;
  const item: StockItem | null =
    variant && localQuantity !== null
      ? {
          sku: variant.sku ?? variant.id,
          unit: "pcs",
          quantity: localQuantity,
          price: Number(variant.basePrice),
          purchasePrice: latestUnitCost,
        }
      : null;

  const batchesWithStock = useMemo(() => localBatches.filter((batch) => batch.remaining > 0), [localBatches]);

  // Moves the item's local stock (and one local batch's) up or down and logs it - never reaches the server.
  function applyMovement(movement: Omit<RecordedMovement, "id" | "date" | "amount" | "sku">) {
    if (!item || !variant) return;
    setRecorded((current) => [
      { ...movement, id: `local-${Date.now()}`, date: today(), amount: null, sku: variant.id },
      ...current,
    ]);
    setLocalQuantity((current) => (current ?? 0) + movement.quantity);
    setLocalBatches((current) => {
      const existing = current.find((row) => row.id === movement.batchId);
      if (!existing) {
        if (!movement.newBatch) return current;
        return [
          {
            id: movement.batchId,
            batchNo: movement.batchNo,
            barcode: movement.newBatch.barcode,
            receivedOn: movement.newBatch.receivedOn,
            received: movement.quantity,
            remaining: movement.quantity,
            unitCost: movement.newBatch.unitCost,
          },
          ...current,
        ];
      }
      return current.map((row) =>
        row.id === movement.batchId
          ? { ...row, remaining: row.remaining + movement.quantity, received: Math.max(row.received, row.remaining + movement.quantity) }
          : row,
      );
    });
  }

  function handleRecord(input: MovementInput) {
    if (!item) return;
    const isNewBatch = input.batchId === NEW_BATCH_ID;
    const existing = localBatches.find((row) => row.id === input.batchId);
    if (!isNewBatch && !existing) return;

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

    const todayDate = today();
    const salt = Date.now();
    const batchId = isNewBatch ? `local-batch-${salt}` : (existing?.id ?? "");
    const batchNo = isNewBatch ? nextBatchNo(localBatches, todayDate) : (existing?.batchNo ?? "");

    applyMovement({
      type,
      reference,
      quantity,
      batchId,
      batchNo,
      newBatch: isNewBatch
        ? {
            barcode: makeBatchBarcode(item.sku, salt),
            receivedOn: todayDate,
            unitCost: input.unitCost ?? item.purchasePrice,
          }
        : undefined,
    });
    setRecording(false);
    setNotice(
      isNewBatch
        ? `${input.quantity} ${item.unit} added as new batch ${batchNo} (not saved to the server).`
        : `${input.quantity} ${item.unit} ${quantity > 0 ? "added to" : "taken out of"} batch ${batchNo} (not saved to the server).`,
    );
  }

  function handleUndo(movement: RecordedMovement) {
    const batch = localBatches.find((row) => row.id === movement.batchId);
    if (!batch) return;
    if (batch.remaining - movement.quantity < 0) {
      setNotice("That can't be undone: the stock it added has already gone out.");
      return;
    }
    setRecorded((current) =>
      current.map((row) => (row.id === movement.id ? { ...row, reversed: true } : row)),
    );
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

  const backHref =
    product && product.variants.length > 1
      ? `/stocks/${encodeURIComponent(productId)}/variants`
      : "/stocks";

  const message =
    products === undefined
      ? "Loading stock..."
      : !product
        ? "We couldn't find this product."
        : !variant
          ? "Choose a variant from the variant list to see its stock."
          : null;

  const subtitle = product && variant ? `Variant ${variant.name}` : undefined;

  return (
    <div>
      <PageHeader
        title={product ? product.name : "Stock"}
        subtitle={subtitle}
        backHref={backHref}
        backLabel={product && product.variants.length > 1 ? "Back to variants" : "Back to stocks"}
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
      ) : item ? (
        <>
          {notice ? <Notice style={{ marginBottom: spacing[4] }}>{notice}</Notice> : null}
          <div style={{ marginTop: spacing[8] }}>
            <Tabs aria-label="Stock sections" tabs={TABS} value={tab} onChange={setTab} />
          </div>
          <div role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ marginTop: spacing[8] }}>
            {tab === "overview" ? (
              <StockOverviewTab item={item} lastPurchaseDate={lastPurchaseDate} lastSaleDate={null} />
            ) : null}
            {tab === "current" ? (
              <CurrentBatchesTab
                item={item}
                batches={batchesWithStock}
                title={product && variant ? `${product.name} - ${variant.name}` : ""}
              />
            ) : null}
            {tab === "purchases" ? (
              <PurchaseHistoryTab item={item} purchases={purchaseLines} supplierName={supplierName} />
            ) : null}
            {tab === "movements" ? (
              <StockMovementsTab item={item} recorded={recorded} historical={realMovements} onUndo={handleUndo} />
            ) : null}
          </div>
          <RecordMovementSheet
            open={recording}
            onClose={() => setRecording(false)}
            batches={localBatches}
            unit={item.unit}
            newBatchUnitCost={item.purchasePrice}
            onSubmit={handleRecord}
          />
        </>
      ) : null}
    </div>
  );
}
