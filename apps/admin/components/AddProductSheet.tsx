"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Select, Sheet } from "@zenzoo/ui-web";
import { useEffect, useState, type KeyboardEvent } from "react";
import { priceProblem, toPrice } from "../features/stocks/stock-validation";
import type { CategoryResponse } from "../lib/catalogue";
import type { CreateProductInput } from "../lib/realProducts";
import FormField from "./FormField";

interface AddProductSheetProps {
  open: boolean;
  /** Names of products already in the catalogue, so a name can't be used twice. */
  existingNames: string[];
  /** The active units to choose from - fetched by the caller, live. */
  unitOptions: { value: string; label: string }[];
  /** This store's full category tree, flat - fetched by the caller, live. */
  categories: CategoryResponse[];
  onClose: () => void;
  /** Returns the SKU that clashed and why, or null on success. May be async. */
  onSubmit: (
    input: CreateProductInput,
  ) => { sku: string; error: string } | null | Promise<{ sku: string; error: string } | null>;
}

// Enter moves to the next field, or saves from the last one.
const ORDER = [
  "product-name",
  "product-sku",
  "product-price",
  "product-unit",
  "product-category",
  "product-subcategory",
];

function focusField(id: string) {
  document.getElementById(id)?.focus();
}

/**
 * Creates a brand-new product directly from wherever a new one is needed
 * mid-flow (right now: picking products for a purchase) - no quantity
 * field, unlike VariantSheet, since stock here comes from the purchase
 * line itself, not from a starting "available" count.
 */
export default function AddProductSheet({
  open,
  existingNames,
  unitOptions,
  categories,
  onClose,
  onSubmit,
}: AddProductSheetProps) {
  const { spacing } = useTheme();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unitId, setUnitId] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [skuError, setSkuError] = useState<{ sku: string; message: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const topLevelCategories = categories.filter((category) => category.parentId === null);
  const categoryOptions = topLevelCategories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
  const subcategoryOptions = categories
    .filter((category) => category.parentId === categoryId)
    .map((category) => ({ value: category.id, label: category.name }));

  useEffect(() => {
    if (!open) {
      setName("");
      setSku("");
      setUnitId("");
      setPrice("");
      setCategoryId("");
      setSubcategoryId("");
      setSkuError(null);
      setTouched(false);
      setSubmitting(false);
    } else {
      setUnitId((current) => current || unitOptions[0]?.value || "");
      setCategoryId((current) => {
        if (current) return current;
        const others = topLevelCategories.find(
          (category) => category.name.toLowerCase() === "others",
        );
        return others?.id ?? topLevelCategories[0]?.id ?? "";
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unitOptions, categories]);

  function changeCategory(next: string) {
    setCategoryId(next);
    setSubcategoryId("");
  }

  const nameTaken = existingNames.some(
    (existing) => existing.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const nameError =
    name.trim() === ""
      ? "Name this product."
      : nameTaken
        ? "A product with this name already exists."
        : null;
  const priceError = priceProblem(price);
  const skuMessage =
    skuError && skuError.sku.toLowerCase() === sku.trim().toLowerCase() ? skuError.message : null;

  const valid = !nameError && !priceError && unitId !== "" && categoryId !== "";

  async function submit() {
    setTouched(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    const clash = await onSubmit({
      name: name.trim(),
      sku: sku.trim() === "" ? undefined : sku.trim(),
      basePrice: toPrice(price),
      unitId,
      categoryId: subcategoryId || categoryId,
    });
    setSubmitting(false);
    if (clash) {
      setSkuError({ sku: clash.sku, message: clash.error });
      focusField("product-sku");
    }
  }

  function enterFrom(id: string) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const next = ORDER[ORDER.indexOf(id) + 1];
      if (next) focusField(next);
      else submit();
    };
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add product"
      width={560}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button type="submit" form="add-product-form" variant="primary" disabled={submitting} style={{ flex: 2 }}>
            {submitting ? "Saving..." : "Add product"}
          </Button>
        </div>
      }
    >
      <form
        id="add-product-form"
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
            id="product-name"
            label="PRODUCT NAME"
            span={12}
            error={touched ? nameError : null}
          >
            <Input
              id="product-name"
              autoFocus
              autoComplete="off"
              placeholder="e.g. Basmati Rice 1kg"
              value={name}
              aria-invalid={touched && nameError ? true : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={enterFrom("product-name")}
            />
          </FormField>
          <FormField id="product-sku" label="SKU (OPTIONAL)" span={6} error={skuMessage}>
            <Input
              id="product-sku"
              autoComplete="off"
              placeholder="Auto-generated if blank"
              value={sku}
              aria-invalid={skuMessage ? true : undefined}
              onChange={(event) => {
                setSku(event.target.value);
                setSkuError(null);
              }}
              onKeyDown={enterFrom("product-sku")}
            />
          </FormField>
          <FormField id="product-price" label="SELLING PRICE (₹)" span={6} error={priceError}>
            <Input
              id="product-price"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={price}
              aria-invalid={priceError ? true : undefined}
              onChange={(event) => setPrice(event.target.value)}
              onKeyDown={enterFrom("product-price")}
            />
          </FormField>
          <FormField id="product-unit" label="UNIT" span={6}>
            <Select
              id="product-unit"
              options={unitOptions}
              value={unitId}
              onChange={setUnitId}
              onKeyDown={enterFrom("product-unit")}
            />
          </FormField>
          <FormField id="product-category" label="CATEGORY" span={6}>
            <Select
              id="product-category"
              options={categoryOptions}
              value={categoryId}
              onChange={changeCategory}
              onKeyDown={enterFrom("product-category")}
            />
          </FormField>
          <FormField id="product-subcategory" label="SUBCATEGORY (OPTIONAL)" span={6}>
            <Select
              id="product-subcategory"
              options={[{ value: "", label: "None" }, ...subcategoryOptions]}
              value={subcategoryId}
              onChange={setSubcategoryId}
              onKeyDown={enterFrom("product-subcategory")}
            />
          </FormField>
        </div>
      </form>
    </Sheet>
  );
}
