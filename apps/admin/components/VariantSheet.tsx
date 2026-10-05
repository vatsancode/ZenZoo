"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Select, Sheet } from "@zenzoo/ui-web";
import { useEffect, useState, type KeyboardEvent } from "react";
import { priceProblem, quantityProblem, toPrice } from "../lib/stock-validation";
import { UNIT_OPTIONS, type Unit, type Variant, type VariantInput } from "../lib/stocks";
import FormField from "./FormField";

interface VariantSheetProps {
  open: boolean;
  /** The variant being edited, or null to add a new one. */
  variant: Variant | null;
  /** Names of the product's other variants, so a name can't be used twice. */
  existingNames: string[];
  /** Unit pre-selected when adding. */
  defaultUnit?: Unit;
  /** Lets a new variant start with no stock, e.g. when it's added from a purchase. */
  allowZeroStock?: boolean;
  onClose: () => void;
  /** Returns the SKU that clashed and why, or null on success. */
  onSubmit: (input: VariantInput) => { sku: string; error: string } | null;
}

// Enter moves to the next field, or saves from the last one.
const ORDER = [
  "variant-name",
  "variant-sku",
  "variant-price",
  "variant-purchase-price",
  "variant-quantity",
  "variant-unit",
];

function focusField(id: string) {
  document.getElementById(id)?.focus();
}

export default function VariantSheet({
  open,
  variant,
  existingNames,
  defaultUnit = "pcs",
  allowZeroStock = false,
  onClose,
  onSubmit,
}: VariantSheetProps) {
  const isEditing = variant !== null;
  const { spacing } = useTheme();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("pcs");
  const [price, setPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [skuError, setSkuError] = useState<{ sku: string; message: string } | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setSku("");
      setQuantity("");
      setUnit(defaultUnit);
      setPrice("");
      setPurchasePrice("");
      setSkuError(null);
      setTouched(false);
    } else if (variant) {
      setName(variant.name);
      setSku(variant.sku);
      setQuantity(String(variant.quantity));
      setUnit(variant.unit);
      setPrice(variant.price ? String(variant.price) : "");
    }
  }, [open, variant, defaultUnit]);

  const nameTaken = existingNames.some(
    (existing) => existing.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const nameError =
    name.trim() === ""
      ? "Name this variant."
      : nameTaken
        ? "This product already has a variant with this name."
        : null;
  const quantityError = quantityProblem(quantity, unit, isEditing || allowZeroStock);
  const priceError = priceProblem(price);
  // Purchase price is only asked for when adding; editing leaves it as it was.
  const purchasePriceError = isEditing ? null : priceProblem(purchasePrice);
  const skuMessage =
    skuError && skuError.sku.toLowerCase() === sku.trim().toLowerCase() ? skuError.message : null;

  const valid = !nameError && !quantityError && !priceError && !purchasePriceError;

  function submit() {
    setTouched(true);
    if (!valid) return;
    const clash = onSubmit({
      name,
      sku,
      quantity: Number(quantity),
      unit,
      price: toPrice(price),
      purchasePrice: variant ? variant.purchasePrice : toPrice(purchasePrice),
    });
    if (clash) {
      setSkuError({ sku: clash.sku, message: clash.error });
      focusField("variant-sku");
    }
  }

  const order = isEditing ? ORDER.filter((id) => id !== "variant-purchase-price") : ORDER;
  function enterFrom(id: string) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const next = order[order.indexOf(id) + 1];
      if (next) focusField(next);
      else submit();
    };
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit variant" : "Add new variant"}
      width={560}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" form="variant-form" variant="primary" style={{ flex: 2 }}>
            {isEditing ? "Save changes" : "Add variant"}
          </Button>
        </div>
      }
    >
      <form
        id="variant-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            columnGap: spacing[3],
            rowGap: spacing[6],
            alignItems: "start",
          }}
        >
          <FormField
            id="variant-name"
            label="VARIANT NAME"
            span={6}
            error={touched ? nameError : null}
          >
            <Input
              id="variant-name"
              autoFocus
              autoComplete="off"
              placeholder="e.g. Large"
              value={name}
              aria-invalid={touched && nameError ? true : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={enterFrom("variant-name")}
            />
          </FormField>
          <FormField
            id="variant-sku"
            label={isEditing ? "SKU" : "SKU (OPTIONAL)"}
            span={6}
            error={skuMessage}
          >
            <Input
              id="variant-sku"
              autoComplete="off"
              placeholder={isEditing ? undefined : "Auto-generated if blank"}
              value={sku}
              aria-invalid={skuMessage ? true : undefined}
              onChange={(event) => {
                setSku(event.target.value);
                setSkuError(null);
              }}
              onKeyDown={enterFrom("variant-sku")}
            />
          </FormField>

          <FormField
            id="variant-price"
            label="SELLING PRICE (₹)"
            span={isEditing ? 12 : 6}
            error={priceError}
          >
            <Input
              id="variant-price"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={price}
              aria-invalid={priceError ? true : undefined}
              onChange={(event) => setPrice(event.target.value)}
              onKeyDown={enterFrom("variant-price")}
            />
          </FormField>
          {isEditing ? null : (
            <FormField
              id="variant-purchase-price"
              label="PURCHASE PRICE (₹)"
              span={6}
              error={purchasePriceError}
            >
              <Input
                id="variant-purchase-price"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={purchasePrice}
                aria-invalid={purchasePriceError ? true : undefined}
                onChange={(event) => setPurchasePrice(event.target.value)}
                onKeyDown={enterFrom("variant-purchase-price")}
              />
            </FormField>
          )}

          <FormField
            id="variant-quantity"
            label="AVAILABLE"
            span={6}
            error={touched ? quantityError : null}
          >
            <Input
              id="variant-quantity"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={quantity}
              aria-invalid={touched && quantityError ? true : undefined}
              onChange={(event) => setQuantity(event.target.value)}
              onKeyDown={enterFrom("variant-quantity")}
            />
          </FormField>
          <FormField id="variant-unit" label="UNIT" span={6}>
            <Select
              id="variant-unit"
              options={UNIT_OPTIONS}
              value={unit}
              onChange={(next) => setUnit(next as Unit)}
              onKeyDown={enterFrom("variant-unit")}
            />
          </FormField>
        </div>
      </form>
    </Sheet>
  );
}
