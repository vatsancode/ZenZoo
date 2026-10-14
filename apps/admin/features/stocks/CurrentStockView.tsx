"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Notice, Tabs, textStyle } from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NEW_BATCH_ID, type Batch, type Movement, type MovementType, type StockItem } from "./stock-history";
import { createVariant, listRealProducts, type RealProduct } from "../../lib/realProducts";
import {
  listCurrentStock,
  listInventoryBatches,
  listStockMovements,
  recordMovement,
} from "../../lib/realStock";
import { listPurchases, purchaseLinesForVariant, type Purchase } from "../purchases/purchases";
import { listVendors, type Vendor } from "../vendors/vendors";
import CurrentBatchesTab from "./CurrentBatchesTab";
import PageHeader from "../../components/PageHeader";
import PurchaseHistoryTab from "./PurchaseHistoryTab";
import RecordMovementSheet, { type MovementInput } from "./RecordMovementSheet";
import StockMovementsTab from "./StockMovementsTab";
import StockOverviewTab from "./StockOverviewTab";
import VariantSheet from "../../components/VariantSheet";
import type { VariantInput } from "./stocks";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "current", label: "Current stock" },
  { id: "purchases", label: "Purchase history" },
  { id: "movements", label: "Stock movements" },
];

// The real ledger's own movement_type values to this UI's display type -
// every real type this screen can currently show; anything else (SOLD,
// DAMAGED, ...) has no real write path yet, so isn't listed here rather
// than guessed at. ADJUSTMENT_IN/OUT cover every hand-recorded change
// (add, remove, and both directions of a count correction) - the database
// only distinguishes the direction, not which of the three Record Movement
// actions produced it.
const MOVEMENT_TYPE_LABEL: Record<string, MovementType> = {
  PURCHASED: "Purchased",
  OPENING_STOCK: "Opening stock",
  ADJUSTMENT_IN: "Added",
  ADJUSTMENT_OUT: "Used/out",
};

// Mirrors the database's stock_movement_sign() - stock_movements only ever
// stores a positive quantity; direction comes from the type.
const MOVEMENT_SIGN: Record<string, 1 | -1> = {
  PURCHASED: 1,
  OPENING_STOCK: 1,
  ADJUSTMENT_IN: 1,
  ADJUSTMENT_OUT: -1,
};

/**
 * Stock for one real variant. Overview/Batches/Purchases/Movements all show
 * real data (inventory_batches, stock_movements, purchase_items), and
 * Record Movement writes real data too, via recordMovement - see
 * handleRecord.
 */
export default function CurrentStockView({
  productId,
  variantId,
}: {
  productId: string;
  variantId?: string;
}) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [products, setProducts] = useState<RealProduct[] | undefined>(undefined);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [allPurchases, setAllPurchases] = useState<Purchase[]>([]);
  const [realMovements, setRealMovements] = useState<Movement[]>([]);
  const [lastPurchaseDate, setLastPurchaseDate] = useState<string | null>(null);

  const [tab, setTab] = useState("current");
  const [recording, setRecording] = useState(false);
  const [addingVariant, setAddingVariant] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-fetched from the server whenever stockMap changes - including right
  // after Record Movement writes a real change, see handleRecord.
  const [localQuantity, setLocalQuantity] = useState<number | null>(null);
  const [localBatches, setLocalBatches] = useState<Batch[]>([]);

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
          type: MOVEMENT_TYPE_LABEL[movement.movementType] ?? "Purchased",
          reference: movement.reason ?? movement.referenceType ?? "-",
          quantity: (MOVEMENT_SIGN[movement.movementType] ?? 1) * movement.quantity,
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
          unit: variant.unit,
          quantity: localQuantity,
          price: Number(variant.basePrice),
          purchasePrice: latestUnitCost,
        }
      : null;

  const batchesWithStock = useMemo(() => localBatches.filter((batch) => batch.remaining > 0), [localBatches]);

  async function handleRecord(input: MovementInput): Promise<string | null> {
    if (!variant) return null;
    const isNewBatch = input.batchId === NEW_BATCH_ID;
    const error = await recordMovement(variant.id, {
      batchId: isNewBatch ? null : input.batchId,
      action: input.action,
      quantity: input.quantity,
      unitCost: isNewBatch ? input.unitCost : undefined,
      note: input.note.trim() || undefined,
    });
    if (error) return error;

    setRecording(false);
    setNotice(isNewBatch ? `${input.quantity} ${item?.unit ?? ""} added as a new batch.` : "Stock updated.");
    listCurrentStock().then(setStockMap);
    return null;
  }

  async function handleAddVariant(
    input: VariantInput,
  ): Promise<{ sku: string; error: string } | null> {
    if (!product) return null;
    const result = await createVariant(product.id, {
      name: input.name,
      sku: input.sku.trim() === "" ? undefined : input.sku,
      basePrice: input.price,
      openingQuantity: input.quantity || undefined,
      openingUnitCost: input.quantity ? input.purchasePrice : undefined,
    });
    if (typeof result === "string") {
      return { sku: input.sku, error: result };
    }
    setProducts((current) => current?.map((row) => (row.id === result.id ? result : row)));
    setAddingVariant(false);
    listCurrentStock().then(setStockMap);
    router.push(`/stocks/${encodeURIComponent(product.id)}/variants`);
    return null;
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
            <div style={{ display: "flex", gap: spacing[3] }}>
              <Button variant="secondary" onClick={() => setAddingVariant(true)}>
                Add variant
              </Button>
              <Button variant="primary" onClick={() => setRecording(true)}>
                Record movement
              </Button>
            </div>
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
              <StockMovementsTab item={item} movements={realMovements} />
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
          <VariantSheet
            open={addingVariant}
            variant={null}
            existingNames={product?.variants.map((row) => row.name) ?? []}
            allowZeroStock
            onClose={() => setAddingVariant(false)}
            onSubmit={handleAddVariant}
          />
        </>
      ) : null}
    </div>
  );
}
