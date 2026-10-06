"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Chips, Input, Select, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatPrice } from "../../lib/stock-display";
import { MOVEMENT_ACTIONS, NEW_BATCH_ID, type Batch, type MovementAction } from "./stock-history";
import { priceProblem, quantityProblem, toPrice } from "./stock-validation";
import type { Unit } from "./stocks";
import FormField from "../../components/FormField";

export interface MovementInput {
  batchId: string;
  action: MovementAction;
  /** What the person typed: how many to remove or add, or how many there are now. */
  quantity: number;
  /** Cost per unit of a brand-new batch. Not set when working on an existing batch. */
  unitCost?: number;
  note: string;
}

interface RecordMovementSheetProps {
  open: boolean;
  onClose: () => void;
  /** Every batch of this item, newest first - including ones that have run out. */
  batches: Batch[];
  unit: Unit;
  /** Cost per unit assumed for a brand-new batch. */
  newBatchUnitCost: number;
  onSubmit: (input: MovementInput) => void;
}

// A change this big gets a second "are you sure" press before it's recorded.
const LARGE_VALUE = 25_000;

/** A caption, a control and an error, stacked the same way as FormField but for custom controls. */
function Group({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2], minWidth: 0 }}>
      <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>{label}</div>
      {children}
      {error ? (
        <div style={{ ...textStyle("footnote"), color: colors.danger }} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default function RecordMovementSheet({
  open,
  onClose,
  batches,
  unit,
  newBatchUnitCost,
  onSubmit,
}: RecordMovementSheetProps) {
  const { colors, radius, spacing } = useTheme();

  const [batchId, setBatchId] = useState("");
  const [action, setAction] = useState<MovementAction | "">("");
  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) {
      setBatchId("");
      setAction("");
      setQuantity("");
      setPurchasePrice("");
      setNote("");
      setTouched(false);
      setConfirming(false);
    }
  }, [open]);

  // Any change to what's being recorded cancels a pending "are you sure".
  useEffect(() => {
    setConfirming(false);
  }, [batchId, action, quantity]);

  const newBatchChosen = batchId === NEW_BATCH_ID;
  const batchOptions = useMemo(() => {
    const existing = batches.map((batch) => ({
      value: batch.id,
      // The barcode is in the label so a scanner can find a batch through the search box.
      label: `${batch.batchNo} · ${batch.barcode} · ${batch.remaining} ${unit} left`,
    }));
    // Only adding stock can start a new batch: there's nothing to remove or count in one.
    return action === "add" ? [{ value: NEW_BATCH_ID, label: "New batch" }, ...existing] : existing;
  }, [batches, unit, action]);

  // Adding defaults to a new batch; removing or counting defaults to the newest batch with stock.
  function defaultBatchFor(next: MovementAction): string {
    if (next === "add") return NEW_BATCH_ID;
    return (batches.find((row) => row.remaining > 0) ?? batches[0])?.id ?? "";
  }
  const actionOptions = MOVEMENT_ACTIONS.map((row) => ({ value: row.id, label: row.title }));
  const actionInfo = MOVEMENT_ACTIONS.find((row) => row.id === action);

  const batch = newBatchChosen ? undefined : batches.find((row) => row.id === batchId);
  // Where the quantity lands: an existing batch, or a new one that starts empty.
  const before = newBatchChosen ? 0 : batch?.remaining;
  const purchasePriceError = newBatchChosen ? priceProblem(purchasePrice) : null;
  // A new batch costs what was typed, or the item's usual purchase price if left blank.
  const unitCost = newBatchChosen
    ? purchasePrice.trim() === ""
      ? newBatchUnitCost
      : toPrice(purchasePrice)
    : batch?.unitCost;
  const quantityNumber = Number(quantity);

  const batchError = batch || newBatchChosen ? null : "Choose a batch.";
  const actionError = action ? null : "Choose what you want to do.";
  const noteError = note.trim() === "" ? "Add a short note so we know what happened." : null;

  let quantityError = quantityProblem(quantity, unit, action === "count");
  if (!quantityError && batch) {
    if (action === "remove" && quantityNumber > batch.remaining) {
      quantityError =
        batch.remaining === 0
          ? "This batch has no stock left."
          : `Only ${batch.remaining} ${unit} left in this batch.`;
    } else if (action === "count" && quantityNumber === batch.remaining) {
      quantityError = "That matches what we already have, so there is nothing to fix.";
    }
  }

  const valid = !batchError && !actionError && !noteError && !quantityError && !purchasePriceError;

  // How the batch changes, once everything needed to know is filled in.
  const delta =
    before !== undefined && action && !quantityError
      ? action === "remove"
        ? -quantityNumber
        : action === "add"
          ? quantityNumber
          : quantityNumber - before
      : null;
  const value = unitCost !== undefined && delta !== null ? delta * unitCost : null;
  const isLarge =
    before !== undefined &&
    delta !== null &&
    value !== null &&
    (Math.abs(value) >= LARGE_VALUE || (delta <= -3 && -delta >= before * 0.5));

  function submit() {
    setTouched(true);
    if (!valid || !action) return;
    if (isLarge && !confirming) {
      setConfirming(true);
      return;
    }
    onSubmit({
      batchId,
      action,
      quantity: quantityNumber,
      unitCost: newBatchChosen ? unitCost : undefined,
      note,
    });
  }

  // The result of what's about to be recorded, shown above the buttons once it can be worked out.
  const summary =
    before !== undefined && delta !== null && value !== null ? (
      <div
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: spacing[4],
          marginBottom: spacing[4],
          padding: `${spacing[4]}px ${spacing[5]}px`,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSunken,
        }}
      >
        <div>
          <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>STOCK AFTER</div>
          <div style={{ ...textStyle("title2"), color: colors.ink, marginTop: spacing[1] }}>
            <span style={{ color: colors.inkMuted }}>{before}</span>
            <span aria-hidden="true" style={{ color: colors.inkMuted }}>
              {" → "}
            </span>
            {before + delta} {unit}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: spacing[2],
          }}
        >
          <Badge tone={delta < 0 ? "warning" : delta > 0 ? "success" : "neutral"}>
            {delta > 0 ? "+" : delta < 0 ? "−" : ""}
            {Math.abs(delta)} {unit}
          </Badge>
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            {value < 0 ? "−" : "+"}
            {formatPrice(Math.abs(value))} at cost
          </span>
        </div>
      </div>
    ) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Record movement"
      width={560}
      footer={
        <div>
          {summary}
          <div style={{ display: "flex", gap: spacing[3] }}>
            <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button type="submit" form="record-movement-form" variant="primary" style={{ flex: 2 }}>
              {confirming ? "Yes, record it" : "Record movement"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="record-movement-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[8] }}>
          {/* What do you want to do */}
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
            <Group label="WHAT DO YOU WANT TO DO?" error={touched ? actionError : null}>
              <Chips
                aria-label="What do you want to do"
                columns={3}
                options={actionOptions}
                value={action}
                onChange={(next) => {
                  setAction(next as MovementAction);
                  setBatchId(defaultBatchFor(next as MovementAction));
                  setQuantity("");
                  setPurchasePrice("");
                }}
              />
              {actionInfo ? (
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  {actionInfo.hint}
                </div>
              ) : null}
            </Group>
          </div>

          {/* Which batch - after the action, since adding can start a new one */}
          {action ? (
            <FormField
              id="movement-batch"
              label="BATCH"
              span={12}
              error={touched ? batchError : null}
            >
              <Select
                id="movement-batch"
                options={batchOptions}
                value={batchId}
                onChange={setBatchId}
                placeholder="Choose a batch"
                searchable
                aria-invalid={touched && batchError ? true : undefined}
              />
              <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {newBatchChosen
                  ? "A new batch is created with its own batch number and barcode."
                  : action === "add"
                    ? "Or pick an existing batch to add to. Scan its barcode to find it quickly."
                    : "Scan a batch barcode to find it quickly."}
              </div>
            </FormField>
          ) : null}

          {/* How many, and what that does to the batch */}
          {action && batchId ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                columnGap: spacing[3],
                alignItems: "start",
              }}
            >
              <FormField
                id="movement-quantity"
                label={
                  action === "count"
                    ? `COUNTED NOW (${unit.toUpperCase()})`
                    : `HOW MANY (${unit.toUpperCase()})`
                }
                span={newBatchChosen ? 1 : 2}
                error={touched ? quantityError : null}
              >
                <Input
                  id="movement-quantity"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={action === "count" && batch ? String(batch.remaining) : "0"}
                  value={quantity}
                  aria-invalid={touched && quantityError ? true : undefined}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </FormField>

              {newBatchChosen ? (
                <FormField
                  id="movement-purchase-price"
                  label="PURCHASE PRICE PER UNIT (₹)"
                  span={1}
                  error={touched ? purchasePriceError : null}
                >
                  <Input
                    id="movement-purchase-price"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={String(newBatchUnitCost)}
                    value={purchasePrice}
                    aria-invalid={touched && purchasePriceError ? true : undefined}
                    onChange={(event) => setPurchasePrice(event.target.value)}
                  />
                </FormField>
              ) : null}
            </div>
          ) : null}

          {confirming && value !== null ? (
            <div
              role="alert"
              style={{
                ...textStyle("callout"),
                color: colors.ink,
                padding: `${spacing[3]}px ${spacing[4]}px`,
                borderRadius: radius.md,
                border: `1px solid ${colors.warning}`,
              }}
            >
              This changes your stock by {formatPrice(Math.abs(value))}. Check it is right, then
              press &ldquo;Yes, record it&rdquo;.
            </div>
          ) : null}

          {action ? (
            <FormField id="movement-note" label="NOTE" span={12} error={touched ? noteError : null}>
              <Input
                id="movement-note"
                autoComplete="off"
                placeholder="What happened? e.g. Water damage in storage"
                value={note}
                aria-invalid={touched && noteError ? true : undefined}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}
