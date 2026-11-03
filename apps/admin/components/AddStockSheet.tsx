"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Select, Sheet, Switch, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState, type KeyboardEvent } from "react";
import { priceProblem, quantityProblem, toPrice } from "../features/stocks/stock-validation";
import type { CategoryResponse } from "../lib/catalogue";
import type { RealProduct } from "../lib/realProducts";
import CategoryPicker from "./CategoryPicker";
import FormField from "./FormField";
import { useSingleFlight } from "../lib/useSingleFlight";

/** Everything this form collects, flat - the caller decides which real actions to call with it. */
export interface StockFormInput {
  name: string;
  hasVariants: boolean;
  variantName: string;
  sku: string;
  price: number;
  openingUnitCost: number;
  openingQuantity: number;
  unitId: string;
  categoryId: string;
}

interface AddStockSheetProps {
  open: boolean;
  /** Names already in use, so a new product can't clash - excludes the product being edited, if any. */
  existingNames: string[];
  /** When set, the sheet edits this product instead of adding a new one. */
  product?: RealProduct | null;
  /** The active units to choose from - fetched by the caller, live. */
  unitOptions: { value: string; label: string }[];
  /** This store's full category tree, flat - fetched by the caller, live. */
  categories: CategoryResponse[];
  /**
   * Quick-create of a unit / category from the dropdowns. Each is offered only when its flag is
   * set - the caller passes the Settings write permission, not Stocks'. A unit is created when
   * the product is saved and returns the new id, or the server's reason it failed. A category is
   * saved as soon as it is named; the caller adds the new row to `categories`.
   */
  canCreateUnit?: boolean;
  canCreateCategory?: boolean;
  onCreateUnit?: (input: {
    code: string;
    name: string;
    allowDecimals: boolean;
  }) => Promise<{ id: string } | { error: string }>;
  onCategoryCreated: (row: CategoryResponse) => void;
  onClose: () => void;
  /** Returns the SKU that clashed and why, or null on success. */
  onSubmit: (input: StockFormInput) => Promise<{ sku: string; error: string } | null>;
}

function focusField(id: string) {
  document.getElementById(id)?.focus();
}

/**
 * Creates or edits a product. "Available"/"Purchase price" are only asked
 * when adding, and only mean something when a quantity is actually given -
 * they become a real opening-stock batch, not a disguised purchase (see
 * createProduct/recordOpeningStock on the backend). Editing never touches
 * stock here; that only ever happens through a real delivery.
 */
export default function AddStockSheet({
  open,
  existingNames,
  product = null,
  unitOptions,
  categories,
  canCreateUnit = false,
  canCreateCategory = false,
  onCreateUnit,
  onCategoryCreated,
  onClose,
  onSubmit,
}: AddStockSheetProps) {
  const { colors, radius, spacing } = useTheme();

  const [name, setName] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [variantName, setVariantName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");
  const [price, setPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  // A typed-in unit code that isn't in the list yet is created on save.
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitDecimals, setNewUnitDecimals] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<{ sku: string; message: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const { busy: submitting, run: runSave } = useSingleFlight();

  const topLevelCategories = categories.filter((category) => category.parentId === null);

  const pendingUnit = unitId !== "" && !unitOptions.some((option) => option.value === unitId);

  const isEditing = product !== null;
  // A product with more than its one starting variant keeps each variant's
  // own SKU, price and stock on the variants page - only name/category/unit
  // are editable here. Unit is the exception: every variant under a product
  // shares one, so it's still a real product-level field even then.
  const editingVariants = isEditing && product.variantCount > 1;
  // Named for the common case, but works as "the product's first variant"
  // for any count - every variant shares a unit, so any of them will do.
  const soleVariant = isEditing ? product.variants[0] : undefined;

  useEffect(() => {
    if (!open) {
      setName("");
      setHasVariants(false);
      setVariantName("");
      setSku("");
      setQuantity("");
      setUnitId("");
      setPrice("");
      setPurchasePrice("");
      setCategoryId("");
      setSubcategoryId("");
      setNewUnitName("");
      setNewUnitDecimals(false);
      setCreateError(null);
      setSkuError(null);
      setTouched(false);
    } else if (product) {
      // Only when the sheet opens or switches product - not when the lists change, which would
      // overwrite what the user has typed since (e.g. after adding a category here).
      setName(product.name);
      setHasVariants(product.variantCount > 1);
      if (soleVariant) {
        setSku(soleVariant.sku ?? "");
        setUnitId(soleVariant.unitId);
        setPrice(soleVariant.basePrice);
      }
      const matchedCategory = categories.find((category) => category.id === product.categoryId);
      const topLevelId =
        matchedCategory?.parentId === null ? matchedCategory.id : matchedCategory?.parentId;
      setCategoryId(topLevelId ?? "");
      setSubcategoryId(matchedCategory?.parentId !== null ? (matchedCategory?.id ?? "") : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  // A new product starts on the first unit and on "Others" (or the first category), filled in
  // once the lists arrive. `current ||` keeps whatever the user has already chosen.
  useEffect(() => {
    if (!open || product) return;
    setUnitId((current) => current || unitOptions[0]?.value || "");
    setCategoryId((current) => {
      if (current) return current;
      const others = topLevelCategories.find(
        (category) => category.name.toLowerCase() === "others",
      );
      return others?.id ?? topLevelCategories[0]?.id ?? "";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product, unitOptions, categories]);

  const unitCode = pendingUnit
    ? ""
    : (unitOptions.find((option) => option.value === unitId)?.label ?? "");

  const nameTaken = existingNames.some(
    (existing) => existing.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const nameError =
    name.trim() === ""
      ? "Enter the product name."
      : nameTaken
        ? "A product with this name already exists."
        : null;
  const variantNameError =
    hasVariants && !isEditing && variantName.trim() === ""
      ? "Name the first variant, e.g. Large."
      : null;
  // Opening stock is optional - zero means "no starting stock", not an error.
  const quantityError =
    editingVariants || isEditing || quantity.trim() === ""
      ? null
      : (quantityProblem(quantity, unitCode, true) ??
        (pendingUnit && !newUnitDecimals && !Number.isInteger(Number(quantity))
          ? `${unitId} is counted in whole numbers.`
          : null));
  const newUnitError = !pendingUnit
    ? null
    : !/^[A-Za-z0-9]{1,10}$/.test(unitId.trim())
      ? "A unit code uses letters and numbers only, up to 10."
      : newUnitName.trim() === ""
        ? "Name the unit, like Dozen."
        : null;
  const priceError = editingVariants ? null : priceProblem(price);
  // Purchase price only matters once a quantity is actually given.
  const purchasePriceError =
    isEditing || quantity.trim() === "" || Number(quantity) === 0 ? null : priceProblem(purchasePrice);
  const categoryError = categoryId === "" ? "Choose a category." : null;
  const skuMessage =
    skuError && skuError.sku.toLowerCase() === sku.trim().toLowerCase() ? skuError.message : null;

  const valid =
    !nameError && !variantNameError && !quantityError && !priceError && !purchasePriceError && !categoryError && !newUnitError;

  function submit() {
    return runSave(async () => {
      setTouched(true);
      if (!valid) return;
      setCreateError(null);

      // A typed-in unit is created now. Swapping in the real id straight away means a retry
      // after a failed save doesn't create it twice.
      let finalUnitId = unitId;
      if (pendingUnit) {
        const created = await onCreateUnit?.({
          code: unitId.trim(),
          name: newUnitName.trim(),
          allowDecimals: newUnitDecimals,
        });
        if (!created || "error" in created) {
          setCreateError(created?.error ?? "You can't add units.");
          return;
        }
        finalUnitId = created.id;
        setUnitId(created.id);
      }

      const clash = await onSubmit({
        name: name.trim(),
        hasVariants,
        variantName: variantName.trim(),
        sku: sku.trim(),
        price: toPrice(price),
        openingUnitCost: toPrice(purchasePrice),
        openingQuantity: quantity.trim() === "" ? 0 : Number(quantity),
        unitId: finalUnitId,
        categoryId: subcategoryId || categoryId,
      });
      if (clash) {
        setSkuError({ sku: clash.sku, message: clash.error });
        focusField("add-stock-sku");
      }
    });
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
          ...(isEditing ? [] : ["add-stock-purchase-price", "add-stock-quantity"]),
        ]),
    "add-stock-unit",
    "add-stock-category",
    "add-stock-subcategory",
  ];
  function enterFrom(id: string) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const next = order[order.indexOf(id) + 1];
      if (next) focusField(next);
      else void submit();
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
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" form="add-stock-form" variant="primary" disabled={submitting} style={{ flex: 2 }}>
            {submitting ? "Saving..." : isEditing ? "Save changes" : "Add product"}
          </Button>
        </div>
      }
    >
      <form
        id="add-stock-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
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
              disabled={submitting}
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
                disabled={submitting}
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
                  disabled={submitting}
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
                  disabled={submitting}
                  aria-invalid={priceError ? true : undefined}
                  onChange={(event) => setPrice(event.target.value)}
                  onKeyDown={enterFrom("add-stock-price")}
                />
              </FormField>
              {isEditing ? null : (
                <>
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
                      disabled={submitting}
                      aria-invalid={purchasePriceError ? true : undefined}
                      onChange={(event) => setPurchasePrice(event.target.value)}
                      onKeyDown={enterFrom("add-stock-purchase-price")}
                    />
                    <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      Recorded as real opening stock, if you give it a quantity below.
                    </span>
                  </FormField>
                  <FormField
                    id="add-stock-quantity"
                    label="AVAILABLE (OPTIONAL)"
                    span={6}
                    error={touched ? quantityError : null}
                  >
                    <Input
                      id="add-stock-quantity"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={quantity}
                      disabled={submitting}
                      aria-invalid={touched && quantityError ? true : undefined}
                      onChange={(event) => setQuantity(event.target.value)}
                      onKeyDown={enterFrom("add-stock-quantity")}
                    />
                  </FormField>
                </>
              )}
            </>
          )}

          <FormField
            id="add-stock-unit"
            label="UNIT"
            span={editingVariants ? 12 : 6}
          >
            <Select
              id="add-stock-unit"
              options={unitOptions}
              value={unitId}
              creatable={canCreateUnit}
              createLabel="Add new unit"
              onChange={setUnitId}
              onKeyDown={enterFrom("add-stock-unit")}
            />
            {editingVariants ? (
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                Applies to every variant of this product.
              </span>
            ) : null}
          </FormField>

          {pendingUnit ? (
            <>
              <FormField
                id="add-stock-new-unit-name"
                label={`NAME FOR "${unitId.trim()}"`}
                span={6}
                error={touched ? newUnitError : null}
              >
                <Input
                  id="add-stock-new-unit-name"
                  autoComplete="off"
                  placeholder="e.g. Dozen"
                  value={newUnitName}
                  disabled={submitting}
                  aria-invalid={touched && newUnitError ? true : undefined}
                  onChange={(event) => setNewUnitName(event.target.value)}
                />
              </FormField>
              <div
                style={{
                  gridColumn: "span 6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing[3],
                }}
              >
                <label htmlFor="add-stock-new-unit-decimals" style={{ ...textStyle("body"), color: colors.ink }}>
                  Allows decimals
                </label>
                <Switch
                  id="add-stock-new-unit-decimals"
                  checked={newUnitDecimals}
                  onChange={setNewUnitDecimals}
                />
              </div>
            </>
          ) : null}

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

          <CategoryPicker
            idPrefix="add-stock"
            span={6}
            categories={categories}
            categoryId={categoryId}
            subcategoryId={subcategoryId}
            canCreate={canCreateCategory}
            error={touched ? categoryError : null}
            disabled={submitting}
            onCreated={onCategoryCreated}
            onChange={(next) => {
              setCategoryId(next.categoryId);
              setSubcategoryId(next.subcategoryId);
            }}
            onFieldKeyDown={enterFrom}
          />
          {createError ? (
            <div
              role="alert"
              style={{ ...textStyle("footnote"), gridColumn: "span 12", color: colors.danger }}
            >
              {createError}
            </div>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}
