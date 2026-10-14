"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Chips,
  IconButton,
  Input,
  Modal,
  Notice,
  Pagination,
  Select,
  Sheet,
  Table,
  Tabs,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import {
  addCatalogueItem,
  deleteCatalogueItem,
  editCatalogueItem,
  listCatalogueItems,
  removeFromCatalogue,
  type CatalogueItem,
  type CatalogueKind,
  type PricingMode,
} from "../lib/catalogue-items";
import { createCategoryRow, listCategoriesFlat, type CategoryResponse } from "../lib/catalogue";
import { formatPrice } from "../lib/stock-display";
import FormField from "./FormField";
import ImportFromInventoryModal from "./ImportFromInventoryModal";

const PRICING_OPTIONS = [
  { value: "fixed", label: "Fixed price" },
  { value: "custom", label: "Custom per order" },
];

const ALL = "";

const KIND_LABEL: Record<CatalogueKind, string> = {
  made_to_order: "Made to order",
  product: "From inventory",
};

type KindTab = "all" | CatalogueKind;

/** "Sarees › Silk" for a subcategory, so two "Silk"s under different parents stay distinguishable. */
function categoryLabel(row: CategoryResponse, rows: CategoryResponse[]): string {
  const parent = row.parentId ? rows.find((other) => other.id === row.parentId) : undefined;
  return parent ? `${parent.name} › ${row.name}` : row.name;
}

/**
 * Everything the till may sell: made-to-order items (services, later recipes),
 * edited here, and inventory products imported from Stocks, edited there.
 */
export default function CatalogueTable() {
  const { colors, spacing } = useTheme();
  const [items, setItems] = useState<CatalogueItem[] | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [kind, setKind] = useState<KindTab>("all");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // null = closed; an item = editing it; "new" = adding.
  const [editing, setEditing] = useState<CatalogueItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<CatalogueItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // The form's fields.
  const [name, setName] = useState("");
  // Each holds a real category id, or the text typed into "Add new..." until saved.
  const [formCategory, setFormCategory] = useState("");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [pricing, setPricing] = useState<PricingMode>("fixed");
  const [price, setPrice] = useState("");
  const [touched, setTouched] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function reload() {
    try {
      const [nextItems, nextCategories] = await Promise.all([
        listCatalogueItems(),
        listCategoriesFlat(),
      ]);
      setItems(nextItems);
      setCategories(nextCategories);
    } catch (reason) {
      setItems([]);
      setNotice(reason instanceof Error ? reason.message : "Couldn't load the catalogue.");
    }
  }

  const isCategoryId = (value: string) => categories.some((row) => row.id === value);
  const topLevelOptions = categories
    .filter((row) => row.parentId === null)
    .map((row) => ({ value: row.id, label: row.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const subcategoryOptions = categories
    .filter((row) => row.parentId !== null && row.parentId === formCategory)
    .map((row) => ({ value: row.id, label: row.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const categoryOptions = useMemo(
    () =>
      categories
        .map((row) => ({ value: row.id, label: categoryLabel(row, categories) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (category !== ALL && item.categoryId !== category) return false;
      if (kind !== "all" && item.kind !== kind) return false;
      return !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [items, query, category, kind]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function openForm(target: CatalogueItem | "new") {
    // An imported product is edited on the Stocks side - its price and name live there.
    if (target !== "new" && target.kind === "product") return;
    setEditing(target);
    setName(target === "new" ? "" : target.name);
    // An item filed under a subcategory opens with its parent in Category and itself in Subcategory.
    const current =
      target === "new" ? undefined : categories.find((row) => row.id === target.categoryId);
    setFormCategory(current?.parentId ?? current?.id ?? "");
    setFormSubcategory(current?.parentId ? current.id : "");
    setPricing(target === "new" ? "fixed" : target.pricing);
    setPrice(target === "new" || target.price === undefined ? "" : String(target.price));
    setTouched(false);
    setSaveError(null);
  }

  const value = price.trim() === "" ? 0 : Number(price);
  const problems = {
    name: name.trim() === "" ? "Enter a name." : null,
    category: formCategory.trim() === "" ? "Choose or type a category." : null,
    price: pricing === "fixed" && (Number.isNaN(value) || value <= 0) ? "Enter the price." : null,
  };
  const valid = Object.values(problems).every((item) => item === null);

  async function submit() {
    setTouched(true);
    if (!valid || !editing || saving) return;
    setSaving(true);
    setSaveError(null);

    // Typed-in names (from "Add new...") aren't ids yet - create them first, parent before child.
    let categoryId = formCategory;
    if (!isCategoryId(categoryId)) {
      const created = await createCategoryRow(categoryId.trim());
      if (!created) return failSave("Couldn't create that category.");
      categoryId = created.id;
    }
    let subcategoryId = formSubcategory;
    if (subcategoryId && !isCategoryId(subcategoryId)) {
      const created = await createCategoryRow(subcategoryId.trim(), categoryId);
      if (!created) return failSave("Couldn't create that subcategory.");
      subcategoryId = created.id;
    }

    const input = {
      name: name.trim(),
      categoryId: subcategoryId || categoryId,
      pricing,
      price: value,
    };
    const message =
      editing === "new"
        ? await addCatalogueItem(input)
        : await editCatalogueItem(editing.id, input);
    setSaving(false);
    if (message) {
      setSaveError(message);
      return;
    }
    setNotice(
      editing === "new" ? `${name.trim()} added to the catalogue.` : `${name.trim()} updated.`,
    );
    if (editing === "new") setPage(1);
    setEditing(null);
    void reload();
  }

  function failSave(message: string) {
    setSaving(false);
    setSaveError(message);
  }

  const columns: TableColumn<CatalogueItem>[] = [
    { key: "name", header: "Name", width: "30%", render: (item) => item.name },
    {
      key: "kind",
      header: "Type",
      render: (item) => <Badge tone="neutral">{KIND_LABEL[item.kind]}</Badge>,
    },
    {
      key: "category",
      header: "Category",
      render: (item) => {
        const row = categories.find((other) => other.id === item.categoryId);
        return row ? categoryLabel(row, categories) : item.category;
      },
    },
    {
      key: "pricing",
      header: "Pricing",
      render: (item) =>
        item.pricing === "fixed" ? (
          <span style={textStyle("data")}>
            {item.price === undefined
              ? "No price"
              : item.variantCount > 1
                ? `from ${formatPrice(item.price)}`
                : formatPrice(item.price)}
          </span>
        ) : (
          <Badge tone="neutral">Custom per order</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "96px",
      render: (item) => (
        <span style={{ display: "inline-flex", gap: spacing[1] }}>
          {item.kind === "made_to_order" ? (
            <IconButton
              icon="edit"
              label={`Edit ${item.name}`}
              onClick={(event) => {
                event.stopPropagation();
                openForm(item);
              }}
            />
          ) : null}
          <IconButton
            icon="close"
            label={
              item.kind === "product"
                ? `Remove ${item.name} from the catalogue`
                : `Delete ${item.name}`
            }
            onClick={(event) => {
              event.stopPropagation();
              setDeleting(item);
            }}
          />
        </span>
      ),
    },
  ];

  const count = (which: CatalogueKind) =>
    (items ?? []).filter((item) => item.kind === which).length;
  const kindTabs = [
    { id: "all", label: `All (${items?.length ?? 0})` },
    { id: "made_to_order", label: `${KIND_LABEL.made_to_order} (${count("made_to_order")})` },
    { id: "product", label: `${KIND_LABEL.product} (${count("product")})` },
  ];
  // The Type column only tells rows apart on "All" - each other tab is one type already.
  const shownColumns = kind === "all" ? columns : columns.filter((column) => column.key !== "kind");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <Tabs
        aria-label="Catalogue item types"
        tabs={kindTabs}
        value={kind}
        onChange={(next) => {
          setKind(next as KindTab);
          setPage(1);
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[4],
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: spacing[3], flex: 1, minWidth: 0 }}
        >
          <div style={{ maxWidth: 360, width: "100%" }}>
            <Input
              type="search"
              placeholder="Search name, category..."
              aria-label="Search the catalogue"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div style={{ width: 200 }}>
            <Select
              options={[{ value: ALL, label: "All categories" }, ...categoryOptions]}
              value={category}
              aria-label="Filter by category"
              onChange={(next) => {
                setCategory(next);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: spacing[3], flexShrink: 0 }}>
          <Button type="button" variant="secondary" onClick={() => setImporting(true)}>
            Import from inventory
          </Button>
          <Button type="button" variant="primary" onClick={() => openForm("new")}>
            Add item
          </Button>
        </div>
      </div>

      {notice ? <Notice>{notice}</Notice> : null}

      {items === null ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Loading the catalogue...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          {items.length === 0
            ? "Nothing here yet. Add a made-to-order item, or import products from inventory."
            : kind === "made_to_order" && count("made_to_order") === 0
              ? "No made-to-order items yet. Add services or anything you sell that isn't stock."
              : kind === "product" && count("product") === 0
                ? "No inventory products here yet. Use Import from inventory to add them."
                : "No items match."}
        </div>
      ) : (
        <div role="tabpanel" aria-labelledby={`tab-${kind}`}>
          <Table
            columns={shownColumns}
            rows={visible}
            getRowKey={(item) => item.id}
            onRowClick={openForm}
          />
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            pageSizeOptions={[10, 25, 50]}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add made-to-order item" : "Edit made-to-order item"}
        width={480}
        footer={
          <div style={{ display: "flex", gap: spacing[3] }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(null)}
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="catalogue-form"
              variant="primary"
              disabled={saving}
              style={{ flex: 2 }}
            >
              {saving ? "Saving..." : editing === "new" ? "Add item" : "Save changes"}
            </Button>
          </div>
        }
      >
        <form
          id="catalogue-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}
        >
          <FormField
            id="catalogue-name"
            label="NAME"
            span={12}
            error={touched ? (problems.name ?? saveError) : null}
          >
            <Input
              id="catalogue-name"
              autoFocus
              autoComplete="off"
              placeholder="e.g. Blouse stitching"
              value={name}
              aria-invalid={touched && problems.name ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setSaveError(null);
              }}
            />
          </FormField>
          <FormField
            id="catalogue-category"
            label="CATEGORY"
            span={12}
            error={touched ? problems.category : null}
          >
            <Select
              id="catalogue-category"
              options={topLevelOptions}
              value={formCategory}
              placeholder="e.g. Services"
              creatable
              createLabel="Add new category"
              aria-invalid={touched && problems.category ? true : undefined}
              onChange={(next) => {
                setFormCategory(next);
                setFormSubcategory("");
              }}
            />
          </FormField>
          <FormField id="catalogue-subcategory" label="SUBCATEGORY (OPTIONAL)" span={12}>
            <Select
              id="catalogue-subcategory"
              options={[{ value: "", label: "None" }, ...subcategoryOptions]}
              value={formSubcategory}
              placeholder={formCategory ? "None" : "Choose a category first"}
              creatable
              createLabel="Add new subcategory"
              disabled={formCategory === ""}
              onChange={setFormSubcategory}
            />
          </FormField>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
            <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>PRICING</div>
            <Chips
              aria-label="How it is priced"
              options={PRICING_OPTIONS}
              value={pricing}
              columns={2}
              onChange={(next) => setPricing(next as PricingMode)}
            />
            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
              {pricing === "fixed"
                ? "The same price every time it is sold."
                : "The price is entered at the till for each order."}
            </div>
          </div>
          {pricing === "fixed" ? (
            <FormField
              id="catalogue-price"
              label="PRICE (₹)"
              span={12}
              error={touched ? problems.price : null}
            >
              <Input
                id="catalogue-price"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={price}
                aria-invalid={touched && problems.price ? true : undefined}
                onChange={(event) => setPrice(event.target.value)}
              />
            </FormField>
          ) : null}
        </form>
      </Sheet>

      <ImportFromInventoryModal
        open={importing}
        onClose={() => setImporting(false)}
        onImported={(count) => {
          if (count > 0) {
            setNotice(`${count} ${count === 1 ? "item" : "items"} imported from inventory.`);
            setPage(1);
          } else {
            setNotice("Import settings saved.");
          }
          void reload();
        }}
      />

      <Modal open={deleting !== null} onClose={() => setDeleting(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>
            {deleting?.kind === "product" ? "Remove" : "Delete"} {deleting?.name}?
          </div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            {deleting?.kind === "product"
              ? "It will no longer appear at the Point of Sale. It stays in inventory, and you can import it again any time."
              : "It will no longer appear at the Point of Sale. Past sales that included it are not changed."}
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (!deleting) return;
                const failure =
                  deleting.kind === "product"
                    ? await removeFromCatalogue(deleting.id)
                    : await deleteCatalogueItem(deleting.id);
                setNotice(
                  failure ??
                    (deleting.kind === "product"
                      ? `${deleting.name} removed from the catalogue.`
                      : `${deleting.name} deleted.`),
                );
                setDeleting(null);
                void reload();
              }}
            >
              {deleting?.kind === "product" ? "Remove" : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
