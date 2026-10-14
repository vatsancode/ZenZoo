"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, DatePicker, IconButton, Input, Notice, Select, Switch, textStyle } from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createPurchase,
  getPurchase,
  listPurchases,
  recordReceivedPurchase,
  referenceClash,
  updatePurchase,
  type Purchase,
  type PurchaseInput,
} from "./purchases";
import { today } from "../../lib/date-ranges";
import { formatPrice } from "../../lib/stock-display";
import {
  createProduct,
  createVariant,
  listRealProducts,
  type CreateProductInput,
  type RealProduct,
} from "../../lib/realProducts";
import { listVendors, type Vendor } from "../vendors/vendors";
import { listUnits, unitOptions, type Unit as RealUnit } from "../settings/units";
import { listCategoriesFlat, type CategoryResponse } from "../../lib/catalogue";
import ProductPicker, { type PickedItem } from "./ProductPicker";
import AddProductSheet from "../../components/AddProductSheet";
import FormField from "../../components/FormField";
import PageHeader from "../../components/PageHeader";
import VariantSheet from "../../components/VariantSheet";
import type { VariantInput } from "../stocks/stocks";

/** A line as typed: quantity/cost/discount stay strings until the form is saved. */
interface Row {
  variantId: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: string;
  unitCost: string;
  discount: string;
}

const number = (value: string) => (value.trim() === "" ? 0 : Number(value));
const money = (value: number) => Math.round(value * 100) / 100;

function lineTotal(row: Row): number {
  return money(number(row.quantity) * number(row.unitCost) - number(row.discount));
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <Card>
      <div style={{ ...textStyle("headline"), color: colors.ink }}>{title}</div>
      {hint ? (
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
          {hint}
        </div>
      ) : null}
      <div style={{ marginTop: spacing[6] }}>{children}</div>
    </Card>
  );
}

function SummaryLine({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span
        style={{ ...textStyle(strong ? "bodyMedium" : "body"), color: strong ? colors.ink : colors.inkMuted }}
      >
        {label}
      </span>
      <span style={{ ...textStyle(strong ? "title2" : "data"), color: colors.ink }}>{value}</span>
    </div>
  );
}

/**
 * Always creates or edits a draft - nothing else. Placing the order,
 * cancelling, receiving, and recording a payment are all separate actions
 * on PurchaseDetail, matching the real status machine (draft -> ordered,
 * the only door out of here) - a payment specifically needs a real
 * purchase_id to attach to, so it can never happen before this form's
 * first save, "already received" or not.
 */
export default function PurchaseForm({ purchaseId }: { purchaseId?: string }) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();

  const [products, setProducts] = useState<RealProduct[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [units, setUnits] = useState<RealUnit[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");
  // Only meaningful when creating (purchaseId is undefined) - editing is
  // always a draft edit regardless, so this never applies there.
  const [alreadyReceived, setAlreadyReceived] = useState(false);
  const [touched, setTouched] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addingVariantFor, setAddingVariantFor] = useState<RealProduct | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);

  // undefined while the draft being edited loads; null when it can't be edited.
  const [editing, setEditing] = useState<Purchase | null | undefined>(purchaseId ? undefined : null);

  useEffect(() => {
    listRealProducts().then(setProducts);
    listVendors().then(setVendors);
    listUnits().then(setUnits);
    listCategoriesFlat().then(setCategories);
  }, []);

  const byVariantId = useMemo(() => {
    const map = new Map<string, { name: string; sku: string | null; unit: string }>();
    for (const product of products) {
      for (const variant of product.variants) {
        map.set(variant.id, { name: `${product.name} - ${variant.name}`, sku: variant.sku, unit: variant.unit });
      }
    }
    return map;
  }, [products]);

  useEffect(() => {
    if (!purchaseId) return;
    getPurchase(purchaseId).then((found) => {
      if (!found || found.status !== "draft") {
        setEditing(null);
        return;
      }
      setEditing(found);
      setSupplierId(found.supplierId);
      setReference(found.reference ?? "");
      setDate(found.date.slice(0, 10));
      setDiscount(found.discount ? String(found.discount) : "");
      setTax(found.tax ? String(found.tax) : "");
      setRows(
        found.items.map((item) => ({
          variantId: item.variantId,
          name: item.name,
          sku: item.sku,
          unit: "pcs",
          quantity: String(item.quantity),
          unitCost: String(item.unitCost),
          discount: item.discount ? String(item.discount) : "",
        })),
      );
    });
  }, [purchaseId]);

  const vendorOptions = vendors
    .filter((vendor) => vendor.status === "active")
    .map((vendor) => ({ value: vendor.id, label: vendor.name }));

  const subtotal = rows.reduce((sum, row) => sum + money(number(row.quantity) * number(row.unitCost)), 0);
  const total = money(subtotal - number(discount) + number(tax));

  function addPicked(items: PickedItem[]) {
    const added = items.flatMap(({ variantId, quantity }) => {
      const info = byVariantId.get(variantId);
      if (!info) return [];
      return [{ variantId, name: info.name, sku: info.sku, unit: info.unit, quantity: String(quantity), unitCost: "", discount: "" }];
    });
    setRows((current) => [...current, ...added]);
  }

  async function handleAddVariant(input: VariantInput): Promise<{ sku: string; error: string } | null> {
    if (!addingVariantFor) return null;
    const result = await createVariant(addingVariantFor.id, {
      name: input.name,
      sku: input.sku.trim() === "" ? undefined : input.sku,
      basePrice: input.price,
    });
    if (typeof result === "string") {
      return { sku: input.sku, error: result };
    }
    setProducts((current) => current.map((product) => (product.id === result.id ? result : product)));
    setAddingVariantFor(null);
    return null;
  }

  async function handleAddProduct(
    input: CreateProductInput,
  ): Promise<{ sku: string; error: string } | null> {
    const result = await createProduct(input);
    if (typeof result === "string") {
      return { sku: input.sku ?? "", error: result };
    }
    setProducts((current) => [...current, result]);
    setAddingProduct(false);

    // The whole point of creating it here is to buy it on this purchase -
    // add it to the line items straight away, same shape addPicked uses,
    // just with a sensible quantity of 1 instead of nothing typed yet.
    const variant = result.variants[0];
    if (variant) {
      setRows((current) => [
        ...current,
        {
          variantId: variant.id,
          name: `${result.name} - ${variant.name}`,
          sku: variant.sku,
          unit: variant.unit,
          quantity: "1",
          unitCost: "",
          discount: "",
        },
      ]);
    }
    return null;
  }

  function updateRow(variantId: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.variantId === variantId ? { ...row, ...patch } : row)));
  }

  const problems: string[] = [];
  if (supplierId === "") problems.push("Choose a vendor.");
  if (date === "") problems.push("Choose the purchase date.");
  if (rows.length === 0) problems.push("Add at least one product.");
  rows.forEach((row) => {
    const quantity = number(row.quantity);
    if (!(quantity > 0) || (row.unit === "pcs" && !Number.isInteger(quantity))) {
      problems.push(`Enter a valid quantity for ${row.name}.`);
    }
    if (row.unitCost.trim() === "" || !(number(row.unitCost) >= 0)) {
      problems.push(`Enter the purchase cost for ${row.name}.`);
    }
    const gross = number(row.quantity) * number(row.unitCost);
    const off = number(row.discount);
    if (off < 0 || off > gross) {
      problems.push(`The discount on ${row.name} can't be more than its value.`);
    }
  });
  if (total < 0) problems.push("Discount is more than the purchase value.");

  async function save() {
    setTouched(true);
    setSaveError(null);
    if (problems.length > 0) return;

    const purchases = await listPurchases();
    if (referenceClash(purchases, supplierId, reference, purchaseId)) {
      setReferenceError("This vendor already has a purchase with that invoice number.");
      document.getElementById("purchase-reference")?.focus();
      return;
    }

    const input: PurchaseInput = {
      supplierId,
      reference,
      date,
      adjustment: 0,
      items: rows.map((row) => ({
        variantId: row.variantId,
        quantity: number(row.quantity),
        unitCost: number(row.unitCost),
        discount: number(row.discount),
      })),
    };
    const result = purchaseId
      ? await updatePurchase(purchaseId, input)
      : alreadyReceived
        ? await recordReceivedPurchase(input)
        : await createPurchase(input);
    if (typeof result === "string") {
      setSaveError(result);
      return;
    }
    router.push(`/purchases/${encodeURIComponent(result.id)}`);
  }

  const rowInput = (invalid: boolean): React.CSSProperties => ({
    borderColor: invalid ? colors.danger : colors.border,
  });

  const grid12: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    columnGap: spacing[3],
    rowGap: spacing[6],
    alignItems: "start",
  };

  const itemColumns = "minmax(0, 1fr) 110px 130px 130px 120px 36px";

  if (purchaseId && editing === undefined) {
    return <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading purchase...</div>;
  }
  if (purchaseId && editing === null) {
    return (
      <>
        <PageHeader title="Can't edit this purchase" backHref="/purchases" backLabel="Back to purchases" />
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          Only a draft purchase can be edited. Once an order is placed it is locked.
        </div>
      </>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={purchaseId ? "Edit purchase" : "New purchase"}
        subtitle={purchaseId ? "Change this draft before placing the order" : "Record what you're buying from a vendor"}
        backHref={purchaseId ? `/purchases/${encodeURIComponent(purchaseId)}` : "/purchases"}
        backLabel={purchaseId ? "Back to purchase" : "Back to purchases"}
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: spacing[6], alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
          <Section title="Products" hint="Pick products or variants, then set the quantity and what you're paying for each.">
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
              <ProductPicker
                products={products}
                addedVariantIds={rows.map((row) => row.variantId)}
                onPickMany={addPicked}
                onAddVariant={setAddingVariantFor}
                onAddProduct={() => setAddingProduct(true)}
              />

              <VariantSheet
                open={addingVariantFor !== null}
                variant={null}
                existingNames={addingVariantFor?.variants.map((variant) => variant.name) ?? []}
                allowZeroStock
                onClose={() => setAddingVariantFor(null)}
                onSubmit={handleAddVariant}
              />

              <AddProductSheet
                open={addingProduct}
                existingNames={products.map((product) => product.name)}
                unitOptions={unitOptions(units)}
                categories={categories}
                onClose={() => setAddingProduct(false)}
                onSubmit={handleAddProduct}
              />

              {rows.length === 0 ? (
                <div
                  style={{
                    ...textStyle("callout"),
                    color: colors.inkMuted,
                    textAlign: "center",
                    padding: `${spacing[8]}px ${spacing[4]}px`,
                    backgroundColor: colors.surfaceSunken,
                    borderRadius: radius.lg,
                  }}
                >
                  {touched ? "Add at least one product to continue." : "No products added yet."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: itemColumns,
                      columnGap: spacing[3],
                      padding: `0 ${spacing[4]}px ${spacing[2]}px`,
                      ...textStyle("caption"),
                      color: colors.inkMuted,
                    }}
                  >
                    <span>PRODUCT</span>
                    <span>QUANTITY</span>
                    <span>COST / UNIT (₹)</span>
                    <span>DISCOUNT (₹)</span>
                    <span style={{ textAlign: "right" }}>LINE TOTAL</span>
                    <span />
                  </div>
                  {rows.map((row) => {
                    const quantity = number(row.quantity);
                    const quantityBad = touched && (!(quantity > 0) || (row.unit === "pcs" && !Number.isInteger(quantity)));
                    const discountBad =
                      touched && (number(row.discount) < 0 || number(row.discount) > number(row.quantity) * number(row.unitCost));
                    const costBad = touched && (row.unitCost.trim() === "" || !(number(row.unitCost) >= 0));
                    return (
                      <div
                        key={row.variantId}
                        onMouseEnter={() => setHoveredRow(row.variantId)}
                        onMouseLeave={() => setHoveredRow((current) => (current === row.variantId ? null : current))}
                        style={{
                          display: "grid",
                          gridTemplateColumns: itemColumns,
                          columnGap: spacing[3],
                          alignItems: "center",
                          minHeight: 72,
                          padding: `${spacing[3]}px ${spacing[4]}px`,
                          borderRadius: radius.lg,
                          backgroundColor:
                            hoveredRow === row.variantId ? `color-mix(in srgb, ${colors.ink} 5%, transparent)` : "transparent",
                          transition: "background-color 120ms ease",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...textStyle("body"), color: colors.ink }}>{row.name}</div>
                          {row.sku ? (
                            <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{row.sku}</div>
                          ) : null}
                        </div>
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={`0 ${row.unit}`}
                          aria-label={`Quantity of ${row.name}`}
                          value={row.quantity}
                          style={rowInput(quantityBad)}
                          aria-invalid={quantityBad ? true : undefined}
                          onChange={(event) => updateRow(row.variantId, { quantity: event.target.value })}
                        />
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0.00"
                          aria-label={`Purchase cost of ${row.name}`}
                          value={row.unitCost}
                          style={rowInput(costBad)}
                          aria-invalid={costBad ? true : undefined}
                          onChange={(event) => updateRow(row.variantId, { unitCost: event.target.value })}
                        />
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0.00"
                          aria-label={`Discount on ${row.name}`}
                          value={row.discount}
                          style={rowInput(discountBad)}
                          aria-invalid={discountBad ? true : undefined}
                          onChange={(event) => updateRow(row.variantId, { discount: event.target.value })}
                        />
                        <span style={{ ...textStyle("data"), color: colors.ink, textAlign: "right" }}>
                          {formatPrice(lineTotal(row))}
                        </span>
                        <IconButton
                          icon="close"
                          label={`Remove ${row.name}`}
                          onClick={() => setRows((current) => current.filter((item) => item.variantId !== row.variantId))}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
          <Section title="Purchase details">
            <div style={grid12}>
              <FormField id="purchase-vendor" label="VENDOR" span={12} error={touched && supplierId === "" ? "Choose a vendor." : null}>
                <Select
                  id="purchase-vendor"
                  options={vendorOptions}
                  value={supplierId}
                  placeholder="Choose a vendor"
                  onChange={(next) => {
                    setSupplierId(next);
                    setReferenceError(null);
                  }}
                />
              </FormField>
              <FormField id="purchase-reference" label="INVOICE NUMBER (OPTIONAL)" span={12} error={referenceError}>
                <Input
                  id="purchase-reference"
                  autoComplete="off"
                  placeholder="From the vendor's bill"
                  value={reference}
                  aria-invalid={referenceError ? true : undefined}
                  onChange={(event) => {
                    setReference(event.target.value);
                    setReferenceError(null);
                  }}
                />
              </FormField>
              <FormField id="purchase-date" label="PURCHASE DATE" span={12}>
                <DatePicker id="purchase-date" value={date} clearable={false} onChange={setDate} />
              </FormField>
            </div>

            {!purchaseId ? (
              <div
                style={{
                  marginTop: spacing[6],
                  paddingTop: spacing[5],
                  borderTop: `1px solid ${colors.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing[4],
                }}
              >
                <label htmlFor="purchase-already-received" style={{ ...textStyle("body"), color: colors.ink }}>
                  Already received this purchase
                </label>
                <Switch
                  id="purchase-already-received"
                  checked={alreadyReceived}
                  onChange={setAlreadyReceived}
                />
              </div>
            ) : null}
          </Section>
          <Card>
            <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>Summary</div>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
              <SummaryLine label="Subtotal" value={formatPrice(subtotal)} />
              {[
                { id: "purchase-discount", label: "Extra discount (₹)", value: discount, set: setDiscount },
                { id: "purchase-tax", label: "Tax (₹)", value: tax, set: setTax },
              ].map((field) => (
                <div key={field.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing[3] }}>
                  <label htmlFor={field.id} style={{ ...textStyle("body"), color: colors.inkMuted }}>
                    {field.label}
                  </label>
                  <div style={{ width: 120 }}>
                    <Input id={field.id} inputMode="decimal" autoComplete="off" placeholder="0.00" value={field.value} onChange={(event) => field.set(event.target.value)} />
                  </div>
                </div>
              ))}
              <hr style={{ width: "100%", height: 0, margin: 0, border: "none", borderTop: `1px solid ${colors.border}` }} />
              <SummaryLine label="Total" value={formatPrice(total)} strong />
            </div>
          </Card>

          {saveError ? <Notice>{saveError}</Notice> : null}
          {touched && problems.length > 0 ? (
            <Notice>
              <ul style={{ margin: 0, paddingLeft: spacing[5] }}>
                {problems.slice(0, 4).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: spacing[6],
          zIndex: 5,
          marginTop: spacing[6],
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[4],
          padding: `${spacing[4]}px ${spacing[6]}px`,
          backgroundColor: colors.surfaceRaised,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
        }}
      >
        <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
          Total <span style={{ ...textStyle("title2"), color: colors.ink }}>{formatPrice(total)}</span>
        </span>
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(purchaseId ? `/purchases/${encodeURIComponent(purchaseId)}` : "/purchases")}
          >
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void save()}>
            {purchaseId ? "Save changes" : alreadyReceived ? "Save as received" : "Save as draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}
