"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Button,
  Card,
  DatePicker,
  IconButton,
  Input,
  Notice,
  Select,
  textStyle,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  addPurchase,
  lineTotal,
  getPurchase,
  listPurchases,
  purchaseTotals,
  referenceClash,
  savePurchases,
  updatePurchase,
  type Purchase,
  type PurchaseItem,
  type PurchaseStatus,
} from "./purchases";
import { formatPrice } from "../../lib/stock-display";
import {
  addStock,
  addVariant,
  listProducts,
  saveProducts,
  type AddStockInput,
  type Product,
  type Unit,
  type VariantInput,
} from "../stocks/stocks";
import { listVendors, type Vendor } from "../vendors/vendors";
import AddStockSheet from "../../components/AddStockSheet";
import ProductPicker from "./ProductPicker";
import VariantSheet from "../../components/VariantSheet";
import FormField from "../../components/FormField";
import PageHeader from "../../components/PageHeader";
import PaymentsModal, {
  countedRows,
  newPayRow,
  payRowProblems,
  rowsTotal,
  type PayRow,
} from "./PaymentsModal";
import PurchaseStatusPicker from "./PurchaseStatusPicker";

/** A line as typed: quantity and cost stay strings until the form is saved. */
interface Row {
  sku: string;
  productId: string;
  name: string;
  unit: Unit;
  quantity: string;
  unitCost: string;
  /** Rupees off this line. */
  discount?: string;
  /** How much has arrived; only asked for while the purchase is partially received. */
  received?: string;
}

interface PickOption {
  value: string;
  label: string;
  row: Omit<Row, "quantity">;
}

// The main button says what saving will do, so it follows the chosen status.
const SAVE_LABEL: Record<PurchaseStatus, string> = {
  draft: "Save as draft",
  ordered: "Place order",
  partially_received: "Save as partially received",
  received: "Save as received",
  cancelled: "Save as cancelled",
};

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const number = (value: string) => (value.trim() === "" ? 0 : Number(value));
const money = (value: number) => Math.round(value * 100) / 100;

/** Every product, or every variant of a product, that can be bought. */
function pickOptions(products: Product[]): PickOption[] {
  return products.flatMap((product) =>
    product.variants
      ? product.variants.map((variant) => ({
          value: variant.sku,
          label: `${product.name} - ${variant.name}  (${variant.sku})`,
          row: {
            sku: variant.sku,
            productId: product.id,
            name: `${product.name} - ${variant.name}`,
            unit: variant.unit,
            unitCost: String(variant.purchasePrice || ""),
          },
        }))
      : [
          {
            value: product.sku,
            label: `${product.name}  (${product.sku})`,
            row: {
              sku: product.sku,
              productId: product.id,
              name: product.name,
              unit: product.unit ?? "pcs",
              unitCost: String(product.purchasePrice || ""),
            },
          },
        ],
  );
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

function SummaryLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span
        style={{
          ...textStyle(strong ? "bodyMedium" : "body"),
          color: strong ? colors.ink : colors.inkMuted,
        }}
      >
        {label}
      </span>
      <span style={{ ...textStyle(strong ? "title2" : "data"), color: colors.ink }}>{value}</span>
    </div>
  );
}

/** Records a purchase. With `purchaseId` it edits that draft instead of starting a new one. */
export default function PurchaseForm({ purchaseId }: { purchaseId?: string }) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [vendorId, setVendorId] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [paymentTouched, setPaymentTouched] = useState(false);
  const [payRows, setPayRows] = useState<PayRow[]>([newPayRow()]);
  const [touched, setTouched] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [status, setStatus] = useState<PurchaseStatus>("draft");
  // The product row the pointer is over, so it can be highlighted.
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  // The existing product a new variant is being added to.
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  // undefined while the draft being edited loads; null when it can't be edited.
  const [editing, setEditing] = useState<Purchase | null | undefined>(
    purchaseId ? undefined : null,
  );

  useEffect(() => {
    listProducts().then(setProducts);
    listVendors().then(setVendors);
  }, []);

  useEffect(() => {
    if (!purchaseId) return;
    getPurchase(purchaseId).then((found) => {
      if (!found || found.status !== "draft") {
        setEditing(null);
        return;
      }
      setEditing(found);
      setVendorId(found.vendorId);
      setReference(found.reference ?? "");
      setDate(found.date);
      setStatus(found.status);
      setDiscount(found.discount ? String(found.discount) : "");
      setTax(found.tax ? String(found.tax) : "");
      setAdjustment(found.adjustment ? String(found.adjustment) : "");
      setRows(
        (found.items ?? []).map((item) => ({
          sku: item.sku,
          productId: item.productId,
          name: item.name,
          unit: item.unit,
          quantity: String(item.quantity),
          unitCost: String(item.unitCost),
          discount: item.discount ? String(item.discount) : undefined,
        })),
      );
      if (found.payments && found.payments.length > 0) {
        setPayRows(
          found.payments.map((payment) => ({
            amount: String(payment.amount),
            method: payment.method,
            accountId: payment.accountId,
            date: payment.date,
          })),
        );
      }
    });
  }, [purchaseId]);

  const options = useMemo(() => pickOptions(products), [products]);
  const vendorOptions = vendors
    .filter((vendor) => vendor.status === "active")
    .map((vendor) => ({ value: vendor.id, label: vendor.name }));

  const items: PurchaseItem[] = rows.map((row) => ({
    sku: row.sku,
    productId: row.productId,
    name: row.name,
    unit: row.unit,
    quantity: number(row.quantity),
    unitCost: number(row.unitCost),
    discount: number(row.discount ?? ""),
    // A fully received purchase has everything; a partial one has what was typed in.
    received:
      status === "received"
        ? number(row.quantity)
        : status === "partially_received"
          ? number(row.received ?? "")
          : undefined,
  }));
  const { subtotal, total } = purchaseTotals(
    items,
    number(discount),
    number(tax),
    number(adjustment),
  );
  const paid = rowsTotal(payRows);
  const balance = money(total - paid);

  // A product created here is saved to the catalogue, then added to this purchase.
  function handleNewProduct(input: AddStockInput): { sku: string; error: string } | null {
    const result = addStock(products, input);
    if (!result.ok) return { sku: result.sku, error: result.error };
    setProducts(result.products);
    saveProducts(result.products);
    const added = pickOptions([result.product]).map((option) => ({ ...option.row, quantity: "" }));
    setRows((current) => [...current, ...added]);
    setNewProductOpen(false);
    return null;
  }

  // The variant is saved to the product, then added to this purchase.
  function handleNewVariant(input: VariantInput): { sku: string; error: string } | null {
    if (!variantFor) return null;
    const result = addVariant(products, variantFor.id, input);
    if (!result.ok) return { sku: result.sku, error: result.error };
    setProducts(result.products);
    saveProducts(result.products);
    // The product's newest variant is the one just added.
    const created = result.product.variants?.at(-1);
    const option = pickOptions([result.product]).find((item) => item.value === created?.sku);
    if (option) setRows((current) => [...current, { ...option.row, quantity: "" }]);
    setVariantFor(null);
    return null;
  }

  function updateRow(sku: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.sku === sku ? { ...row, ...patch } : row)));
  }

  // What stops the form being saved, in the order the sections appear.
  const problems: string[] = [];
  if (vendorId === "") problems.push("Choose a vendor.");
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
  });
  rows.forEach((row) => {
    const gross = number(row.quantity) * number(row.unitCost);
    const off = number(row.discount ?? "");
    if (off < 0 || off > gross) {
      problems.push(`The discount on ${row.name} can't be more than its value.`);
    }
  });
  if (status === "partially_received" && rows.length > 0) {
    const receivedAll = rows.every((row) => number(row.received ?? "") === number(row.quantity));
    const receivedAny = rows.some((row) => number(row.received ?? "") > 0);
    if (rows.some((row) => number(row.received ?? "") > number(row.quantity))) {
      problems.push("Received can't be more than the quantity ordered.");
    } else if (!receivedAny) {
      problems.push("Enter how much of at least one product has arrived.");
    } else if (receivedAll) {
      problems.push("Everything has arrived - set the status to Received instead.");
    }
  }
  if (total < 0) problems.push("Discount is more than the purchase value.");
  if (paid < 0 || paid > total) problems.push("Amount paid can't be more than the total.");
  const paymentProblems = payRowProblems(payRows);
  problems.push(...paymentProblems);

  function save() {
    setTouched(true);
    if (problems.length > 0) return;
    void listPurchases().then((purchases) => {
      if (referenceClash(purchases, vendorId, reference, status, purchaseId)) {
        setReferenceError("This vendor already has a purchase with that invoice number.");
        document.getElementById("purchase-reference")?.focus();
        return;
      }
      const input = {
        vendorId,
        reference,
        date,
        status,
        items,
        discount: number(discount),
        tax: number(tax),
        adjustment: number(adjustment),
        payments: countedRows(payRows).map((row) => ({
          amount: number(row.amount),
          method: row.method,
          accountId: row.accountId,
          date: row.date,
        })),
      };
      savePurchases(
        purchaseId ? updatePurchase(purchases, purchaseId, input) : addPurchase(purchases, input),
      );
      router.push(purchaseId ? `/purchases/${encodeURIComponent(purchaseId)}` : "/purchases");
    });
  }

  // A visible outline for fields inside the product rows, so they stay findable on the hovered row.
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

  // Columns of the item rows: product, quantity, cost, line total, remove.
  const itemColumns =
    status === "partially_received"
      ? "minmax(0, 1fr) 100px 100px 120px 120px 120px 36px"
      : "minmax(0, 1fr) 110px 130px 130px 120px 36px";

  if (purchaseId && editing === undefined) {
    return (
      <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading purchase...</div>
    );
  }
  if (purchaseId && editing === null) {
    return (
      <>
        <PageHeader
          title="Can't edit this purchase"
          backHref="/purchases"
          backLabel="Back to purchases"
        />
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
        subtitle={
          purchaseId
            ? "Change this draft before placing the order"
            : "Record what you're buying from a vendor"
        }
        backHref={purchaseId ? `/purchases/${encodeURIComponent(purchaseId)}` : "/purchases"}
        backLabel={purchaseId ? "Back to purchase" : "Back to purchases"}
        action={<PurchaseStatusPicker value={status} onChange={setStatus} />}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          gap: spacing[6],
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
          <Section
            title="Products"
            hint="Pick products or variants, then set the quantity and what you're paying for each."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
              <div style={{ display: "flex", gap: spacing[3] }}>
                <ProductPicker
                  products={products}
                  addedSkus={rows.map((row) => row.sku)}
                  onPickMany={(items) => {
                    const added = items.flatMap(({ sku, quantity }) => {
                      const option = options.find((item) => item.value === sku);
                      return option ? [{ ...option.row, quantity: String(quantity) }] : [];
                    });
                    setRows((current) => [...current, ...added]);
                  }}
                  onAddVariant={setVariantFor}
                />
                <Button type="button" variant="secondary" onClick={() => setNewProductOpen(true)}>
                  Add new product
                </Button>
              </div>

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
                    {status === "partially_received" ? <span>RECEIVED</span> : null}
                    <span>COST / UNIT (₹)</span>
                    <span>DISCOUNT (₹)</span>
                    <span style={{ textAlign: "right" }}>LINE TOTAL</span>
                    <span />
                  </div>
                  {rows.map((row, index) => {
                    const quantity = number(row.quantity);
                    const quantityBad =
                      touched &&
                      (!(quantity > 0) || (row.unit === "pcs" && !Number.isInteger(quantity)));
                    const discountBad =
                      touched &&
                      (number(row.discount ?? "") < 0 ||
                        number(row.discount ?? "") > number(row.quantity) * number(row.unitCost));
                    const costBad =
                      touched && (row.unitCost.trim() === "" || !(number(row.unitCost) >= 0));
                    return (
                      <div
                        key={row.sku}
                        onMouseEnter={() => setHoveredRow(row.sku)}
                        onMouseLeave={() =>
                          setHoveredRow((current) => (current === row.sku ? null : current))
                        }
                        style={{
                          display: "grid",
                          gridTemplateColumns: itemColumns,
                          columnGap: spacing[3],
                          alignItems: "center",
                          minHeight: 72,
                          padding: `${spacing[3]}px ${spacing[4]}px`,
                          borderRadius: radius.lg,
                          backgroundColor:
                            hoveredRow === row.sku
                              ? `color-mix(in srgb, ${colors.ink} 5%, transparent)`
                              : "transparent",
                          transition: "background-color 120ms ease",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...textStyle("body"), color: colors.ink }}>{row.name}</div>
                          <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                            {row.sku}
                          </div>
                        </div>
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={`0 ${row.unit}`}
                          aria-label={`Quantity of ${row.name}`}
                          value={row.quantity}
                          style={rowInput(quantityBad)}
                          aria-invalid={quantityBad ? true : undefined}
                          onChange={(event) => updateRow(row.sku, { quantity: event.target.value })}
                        />
                        {status === "partially_received" ? (
                          <Input
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={`0 ${row.unit}`}
                            aria-label={`Received quantity of ${row.name}`}
                            value={row.received ?? ""}
                            style={rowInput(false)}
                            onChange={(event) =>
                              updateRow(row.sku, { received: event.target.value })
                            }
                          />
                        ) : null}
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0.00"
                          aria-label={`Purchase cost of ${row.name}`}
                          value={row.unitCost}
                          style={rowInput(costBad)}
                          aria-invalid={costBad ? true : undefined}
                          onChange={(event) => updateRow(row.sku, { unitCost: event.target.value })}
                        />
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0.00"
                          aria-label={`Discount on ${row.name}`}
                          value={row.discount ?? ""}
                          style={rowInput(discountBad)}
                          aria-invalid={discountBad ? true : undefined}
                          onChange={(event) => updateRow(row.sku, { discount: event.target.value })}
                        />
                        <span
                          style={{ ...textStyle("data"), color: colors.ink, textAlign: "right" }}
                        >
                          {formatPrice(lineTotal(items[index]!))}
                        </span>
                        <IconButton
                          icon="close"
                          label={`Remove ${row.name}`}
                          onClick={() =>
                            setRows((current) => current.filter((item) => item.sku !== row.sku))
                          }
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
              <FormField
                id="purchase-vendor"
                label="VENDOR"
                span={12}
                error={touched && vendorId === "" ? "Choose a vendor." : null}
              >
                <Select
                  id="purchase-vendor"
                  options={vendorOptions}
                  value={vendorId}
                  placeholder="Choose a vendor"
                  onChange={(next) => {
                    setVendorId(next);
                    setReferenceError(null);
                  }}
                />
              </FormField>
              <FormField
                id="purchase-reference"
                label="INVOICE NUMBER (OPTIONAL)"
                span={12}
                error={referenceError}
              >
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
          </Section>
          <Card>
            <div style={{ ...textStyle("headline"), color: colors.ink, marginBottom: spacing[5] }}>
              Summary
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
              <SummaryLine label="Subtotal" value={formatPrice(subtotal)} />
              {[
                {
                  id: "purchase-discount",
                  label: "Extra discount (₹)",
                  value: discount,
                  set: setDiscount,
                },
                { id: "purchase-tax", label: "Tax (₹)", value: tax, set: setTax },
                {
                  id: "purchase-adjustment",
                  label: "Adjustment (₹)",
                  value: adjustment,
                  set: setAdjustment,
                },
              ].map((field) => (
                <div
                  key={field.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing[3],
                  }}
                >
                  <label
                    htmlFor={field.id}
                    style={{ ...textStyle("body"), color: colors.inkMuted }}
                  >
                    {field.label}
                  </label>
                  <div style={{ width: 120 }}>
                    <Input
                      id={field.id}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={field.value}
                      onChange={(event) => field.set(event.target.value)}
                    />
                  </div>
                </div>
              ))}
              <hr
                style={{
                  width: "100%",
                  height: 0,
                  margin: 0,
                  border: "none",
                  borderTop: `1px solid ${colors.border}`,
                }}
              />
              <SummaryLine label="Total" value={formatPrice(total)} strong />
              <SummaryLine label="Paid now" value={formatPrice(paid)} />
              <SummaryLine label="Balance" value={formatPrice(Math.max(balance, 0))} />
            </div>
          </Card>

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
      {/* Stays in view at the bottom of the screen while the long form scrolls. */}
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
        <div style={{ display: "flex", alignItems: "baseline", gap: spacing[6] }}>
          <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
            Total{" "}
            <span style={{ ...textStyle("title2"), color: colors.ink }}>{formatPrice(total)}</span>
          </span>
          <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
            Balance{" "}
            <span style={{ ...textStyle("data"), color: colors.ink }}>
              {formatPrice(Math.max(balance, 0))}
            </span>
          </span>
          <span
            aria-hidden="true"
            style={{
              alignSelf: "center",
              width: 1,
              height: 20,
              backgroundColor: colors.border,
            }}
          />
          <button
            type="button"
            onClick={() => setPaymentOpen(true)}
            style={{
              ...textStyle("bodyMedium"),
              padding: 0,
              border: "none",
              background: "transparent",
              color: colors.ink,
              cursor: "pointer",
            }}
          >
            Payments
          </button>
        </div>
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              router.push(
                purchaseId ? `/purchases/${encodeURIComponent(purchaseId)}` : "/purchases",
              )
            }
          >
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={save}>
            {SAVE_LABEL[status]}
          </Button>
        </div>
      </div>

      <VariantSheet
        open={variantFor !== null}
        variant={null}
        existingNames={(variantFor?.variants ?? []).map((variant) => variant.name)}
        defaultUnit={variantFor?.unit}
        allowZeroStock
        onClose={() => setVariantFor(null)}
        onSubmit={handleNewVariant}
      />
      <PaymentsModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        subtitle="Add a row for each payment."
        rows={payRows}
        onRowsChange={setPayRows}
        showErrors={paymentTouched}
        footerNote={`Total ${formatPrice(total)} · Balance ${formatPrice(Math.max(balance, 0))}`}
        doneLabel="Done"
        onDone={() => {
          setPaymentTouched(true);
          if (paymentProblems.length === 0) setPaymentOpen(false);
        }}
      />
      <AddStockSheet
        open={newProductOpen}
        products={products}
        allowZeroStock
        onClose={() => setNewProductOpen(false)}
        onSubmit={handleNewProduct}
      />
    </div>
  );
}
