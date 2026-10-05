"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Select, Sheet, Switch, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { priceProblem, quantityProblem, toPrice } from "../lib/stock-validation";
import { categoriesSnapshot } from "../lib/catalogue";
import { UNIT_OPTIONS, type AddStockInput, type Product, type Unit } from "../lib/stocks";
import FormField from "./FormField";

interface AddStockSheetProps {
  open: boolean;
  products: Product[];
  /** When set, the sheet edits this product instead of adding a new one. */
  product?: Product | null;
  /**
   * Lets a new product start with no stock. For adding a product from a purchase,
   * where the stock arrives when the purchase is received, not when it's created.
   */
  allowZeroStock?: boolean;
  onClose: () => void;
  /** Returns the SKU that clashed and why, or null on success. */
  onSubmit: (input: AddStockInput) => { sku: string; error: string } | null;
}

function focusField(id: string) {
  document.getElementById(id)?.focus();
}

export default function AddStockSheet({
  open,
  products,
  product = null,
  allowZeroStock = false,
  onClose,
  onSubmit,
}: AddStockSheetProps) {
  const { colors, radius, spacing } = useTheme();

  const [name, setName] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [variantName, setVariantName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("pcs");
  const [price, setPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [skuError, setSkuError] = useState<{ sku: string; message: string } | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setHasVariants(false);
      setVariantName("");
      setSku("");
      setQuantity("");
      setUnit("pcs");
      setPrice("");
      setPurchasePrice("");
      setCategory("");
      setSubcategory("");
      setSkuError(null);
      setTouched(false);
    } else if (product) {
      const money = (value?: number) => (value ? String(value) : "");
      setName(product.name);
      setHasVariants(Boolean(product.variants));
      setSku(product.sku);
      setQuantity(String(product.quantity));
      setUnit(product.unit ?? "pcs");
      setPrice(money(product.price));
      setPurchasePrice(money(product.purchasePrice));
      setCategory(product.category);
      setSubcategory(product.subcategory ?? "");
    }
  }, [open, product]);

  const categories = useMemo(
    // The managed list from Settings, plus anything products already use.
    () =>
      Array.from(
        new Set([
          ...categoriesSnapshot().map((category) => category.name),
          ...products.map((product) => product.category),
        ]),
      ).sort(),
    [products],
  );
  const subcategories = useMemo(() => {
    const wanted = category.trim().toLowerCase();
    const managed =
      categoriesSnapshot().find((item) => item.name.toLowerCase() === wanted)?.subcategories ?? [];
    return Array.from(
      new Set([
        ...managed,
        ...products
          .filter((product) => product.category.toLowerCase() === wanted)
          .map((product) => product.subcategory)
          .filter((value): value is string => Boolean(value)),
      ]),
    ).sort();
  }, [products, category]);

  const isEditing = product !== null;
  // A product with variants keeps each variant's SKU, prices and stock on the
  // variants page, so only the product-level fields are editable here.
  const editingVariants = isEditing && Boolean(product.variants);

  const categoryOptions = categories.map((item) => ({ value: item, label: item }));
  const subcategoryOptions = subcategories.map((item) => ({ value: item, label: item }));

  const nameError = name.trim() === "" ? "Enter the product name." : null;
  const variantNameError =
    hasVariants && !isEditing && variantName.trim() === ""
      ? "Name the first variant, e.g. Large."
      : null;
  const quantityError = editingVariants
    ? null
    : quantityProblem(quantity, unit, isEditing || allowZeroStock);
  const priceError = editingVariants ? null : priceProblem(price);
  // Purchase price is only asked for when adding; editing leaves it as it was.
  const purchasePriceError = isEditing ? null : priceProblem(purchasePrice);
  const categoryError = category.trim() === "" ? "Choose or type a category." : null;
  const subcategoryError = subcategory.trim() === "" ? "Choose or type a subcategory." : null;
  const skuMessage =
    skuError && skuError.sku.toLowerCase() === sku.trim().toLowerCase() ? skuError.message : null;

  const valid =
    !nameError &&
    !variantNameError &&
    !quantityError &&
    !priceError &&
    !purchasePriceError &&
    !categoryError &&
    !subcategoryError;

  function submit() {
    setTouched(true);
    if (!valid) return;
    const priceNumber = toPrice(price);
    const purchaseNumber = product ? (product.purchasePrice ?? 0) : toPrice(purchasePrice);
    const quantityNumber = Number(quantity);
    const clash = onSubmit({
      name,
      category: category.trim(),
      subcategory,
      sku,
      price: priceNumber,
      purchasePrice: purchaseNumber,
      quantity: quantityNumber,
      unit,
      variants:
        hasVariants && !isEditing
          ? [
              {
                name: variantName.trim(),
                sku,
                price: priceNumber,
                purchasePrice: purchaseNumber,
                quantity: quantityNumber,
                unit,
              },
            ]
          : [],
    });
    if (clash) {
      setSkuError({ sku: clash.sku, message: clash.error });
      focusField("add-stock-sku");
    }
  }

  // Enter moves to the next field, or submits from the last one.
  const order = [
    "add-stock-name",
    ...(hasVariants && !isEditing ? ["add-stock-variant-name"] : []),
    ...(editingVariants
      ? []
      : [
          "add-stock-sku",
          "add-stock-price",
          ...(isEditing ? [] : ["add-stock-purchase-price"]),
          "add-stock-quantity",
          "add-stock-unit",
        ]),
    "add-stock-category",
    "add-stock-subcategory",
  ];
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
      title={isEditing ? "Edit product" : "Add new product"}
      width={560}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" form="add-stock-form" variant="primary" style={{ flex: 2 }}>
            {isEditing ? "Save changes" : "Add product"}
          </Button>
        </div>
      }
    >
      <form
        id="add-stock-form"
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
            id="add-stock-name"
            label="PRODUCT NAME"
            span={12}
            error={touched ? nameError : null}
          >
            <Input
              id="add-stock-name"
              autoFocus
              autoComplete="off"
              placeholder="e.g. Oat milk"
              value={name}
              aria-invalid={touched && nameError ? true : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={enterFrom("add-stock-name")}
            />
          </FormField>

          <div
            style={{
              gridColumn: "span 12",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[4],
              padding: `${spacing[4]}px ${spacing[5]}px`,
              backgroundColor: colors.surfaceSunken,
              borderRadius: radius.lg,
            }}
          >
            <label htmlFor="add-stock-variants" style={{ ...textStyle("body"), color: colors.ink }}>
              Has variants
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
                Different sizes, colors or flavors of the same product, like S / M / L.
              </span>
            </label>
            <Switch
              id="add-stock-variants"
              checked={hasVariants}
              onChange={setHasVariants}
              disabled={isEditing}
            />
          </div>

          <hr
            style={{
              gridColumn: "span 12",
              width: "100%",
              height: 0,
              margin: 0,
              border: "none",
              borderTop: `1px solid ${colors.border}`,
            }}
          />

          {hasVariants && !isEditing ? (
            <FormField
              id="add-stock-variant-name"
              label="FIRST VARIANT"
              span={6}
              error={touched ? variantNameError : null}
            >
              <Input
                id="add-stock-variant-name"
                autoComplete="off"
                placeholder="e.g. Large"
                value={variantName}
                aria-invalid={touched && variantNameError ? true : undefined}
                onChange={(event) => setVariantName(event.target.value)}
                onKeyDown={enterFrom("add-stock-variant-name")}
              />
            </FormField>
          ) : null}

          {editingVariants ? (
            <div
              style={{
                ...textStyle("footnote"),
                gridColumn: "span 12",
                color: colors.inkMuted,
              }}
            >
              Prices, SKUs and stock for each variant are edited on the variants page.
            </div>
          ) : (
            <>
              <FormField
                id="add-stock-sku"
                label={hasVariants ? "VARIANT SKU (OPTIONAL)" : "SKU (OPTIONAL)"}
                span={hasVariants ? 6 : 12}
                error={skuMessage}
              >
                <Input
                  id="add-stock-sku"
                  autoComplete="off"
                  placeholder="Auto-generated if blank"
                  value={sku}
                  aria-invalid={skuMessage ? true : undefined}
                  onChange={(event) => {
                    setSku(event.target.value);
                    setSkuError(null);
                  }}
                  onKeyDown={enterFrom("add-stock-sku")}
                />
              </FormField>

              <FormField
                id="add-stock-price"
                label="SELLING PRICE (₹)"
                span={isEditing ? 12 : 6}
                error={priceError}
              >
                <Input
                  id="add-stock-price"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={price}
                  aria-invalid={priceError ? true : undefined}
                  onChange={(event) => setPrice(event.target.value)}
                  onKeyDown={enterFrom("add-stock-price")}
                />
              </FormField>
              {isEditing ? null : (
                <FormField
                  id="add-stock-purchase-price"
                  label="PURCHASE PRICE (₹)"
                  span={6}
                  error={purchasePriceError}
                >
                  <Input
                    id="add-stock-purchase-price"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={purchasePrice}
                    aria-invalid={purchasePriceError ? true : undefined}
                    onChange={(event) => setPurchasePrice(event.target.value)}
                    onKeyDown={enterFrom("add-stock-purchase-price")}
                  />
                </FormField>
              )}

              <FormField
                id="add-stock-quantity"
                label="AVAILABLE"
                span={6}
                error={touched ? quantityError : null}
              >
                <Input
                  id="add-stock-quantity"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={quantity}
                  aria-invalid={touched && quantityError ? true : undefined}
                  onChange={(event) => setQuantity(event.target.value)}
                  onKeyDown={enterFrom("add-stock-quantity")}
                />
              </FormField>
              <FormField id="add-stock-unit" label="UNIT" span={6}>
                <Select
                  id="add-stock-unit"
                  options={UNIT_OPTIONS}
                  value={unit}
                  onChange={(next) => setUnit(next as Unit)}
                  onKeyDown={enterFrom("add-stock-unit")}
                />
              </FormField>
            </>
          )}

          {hasVariants && !isEditing ? (
            <div
              style={{
                ...textStyle("footnote"),
                gridColumn: "span 12",
                color: colors.inkMuted,
                marginTop: -spacing[2],
              }}
            >
              You can add more variants after creating this product.
            </div>
          ) : null}

          <FormField
            id="add-stock-category"
            label="CATEGORY"
            span={6}
            error={touched ? categoryError : null}
          >
            <Select
              id="add-stock-category"
              options={categoryOptions}
              value={category}
              placeholder="Select a category"
              creatable
              createLabel="Add new category"
              aria-invalid={touched && categoryError ? true : undefined}
              onChange={(next) => {
                if (next !== category) setSubcategory("");
                setCategory(next);
              }}
              onKeyDown={enterFrom("add-stock-category")}
            />
          </FormField>
          <FormField
            id="add-stock-subcategory"
            label="SUBCATEGORY"
            span={6}
            error={touched ? subcategoryError : null}
          >
            <Select
              id="add-stock-subcategory"
              options={subcategoryOptions}
              value={subcategory}
              placeholder={category.trim() ? "Select a subcategory" : "Choose a category first"}
              disabled={category.trim() === ""}
              creatable
              createLabel="Add new subcategory"
              aria-invalid={touched && subcategoryError ? true : undefined}
              onChange={setSubcategory}
              onKeyDown={enterFrom("add-stock-subcategory")}
            />
          </FormField>
        </div>
      </form>
    </Sheet>
  );
}
