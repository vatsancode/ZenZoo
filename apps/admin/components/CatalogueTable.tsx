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
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import {
  addCatalogueItem,
  deleteCatalogueItem,
  editCatalogueItem,
  listCatalogueCategories,
  listCatalogueItems,
  type CatalogueItem,
  type PricingMode,
} from "../lib/catalogue-items";
import { formatPrice } from "../lib/stock-display";
import FormField from "./FormField";

const PRICING_OPTIONS = [
  { value: "fixed", label: "Fixed price" },
  { value: "custom", label: "Custom per order" },
];

const ALL = "";

/** What the shop sells that isn't stock: services and the like, priced fixed or agreed per order. */
export default function CatalogueTable() {
  const { colors, spacing } = useTheme();
  const [items, setItems] = useState<CatalogueItem[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // null = closed; an item = editing it; "new" = adding.
  const [editing, setEditing] = useState<CatalogueItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<CatalogueItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The form's fields.
  const [name, setName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [pricing, setPricing] = useState<PricingMode>("fixed");
  const [price, setPrice] = useState("");
  const [touched, setTouched] = useState(false);
  const [nameTaken, setNameTaken] = useState<string | null>(null);

  async function reload() {
    setItems([...(await listCatalogueItems())]);
    setCategories([...listCatalogueCategories()]);
  }

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
      if (category !== ALL && item.category !== category) return false;
      return !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [items, query, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function openForm(target: CatalogueItem | "new") {
    setEditing(target);
    setName(target === "new" ? "" : target.name);
    setFormCategory(target === "new" ? "" : target.category);
    setPricing(target === "new" ? "fixed" : target.pricing);
    setPrice(target === "new" || target.price === undefined ? "" : String(target.price));
    setTouched(false);
    setNameTaken(null);
  }

  const value = price.trim() === "" ? 0 : Number(price);
  const problems = {
    name: name.trim() === "" ? "Enter a name." : nameTaken,
    category: formCategory.trim() === "" ? "Choose or type a category." : null,
    price: pricing === "fixed" && (Number.isNaN(value) || value <= 0) ? "Enter the price." : null,
  };
  const valid = Object.values(problems).every((item) => item === null);

  function submit() {
    setTouched(true);
    if (!valid || !editing) return;
    const input = { name, category: formCategory, pricing, price: value };
    const message =
      editing === "new" ? addCatalogueItem(input) : editCatalogueItem(editing.id, input);
    if (message) {
      setNameTaken(message);
      return;
    }
    setNotice(
      editing === "new" ? `${name.trim()} added to the catalogue.` : `${name.trim()} updated.`,
    );
    if (editing === "new") setPage(1);
    setEditing(null);
    void reload();
  }

  const columns: TableColumn<CatalogueItem>[] = [
    { key: "name", header: "Name", width: "34%", render: (item) => item.name },
    { key: "category", header: "Category", render: (item) => item.category },
    {
      key: "pricing",
      header: "Pricing",
      render: (item) =>
        item.pricing === "fixed" ? (
          <span style={textStyle("data")}>{formatPrice(item.price ?? 0)}</span>
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
          <IconButton
            icon="edit"
            label={`Edit ${item.name}`}
            onClick={(event) => {
              event.stopPropagation();
              openForm(item);
            }}
          />
          <IconButton
            icon="close"
            label={`Delete ${item.name}`}
            onClick={(event) => {
              event.stopPropagation();
              setDeleting(item);
            }}
          />
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
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
              options={[
                { value: ALL, label: "All categories" },
                ...categories.map((name) => ({ value: name, label: name })),
              ]}
              value={category}
              searchable={false}
              aria-label="Filter by category"
              onChange={(next) => {
                setCategory(next);
                setPage(1);
              }}
            />
          </div>
        </div>
        <Button type="button" variant="primary" onClick={() => openForm("new")}>
          Add item
        </Button>
      </div>

      {notice ? <Notice>{notice}</Notice> : null}

      {items === null ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Loading the catalogue...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          {items.length === 0
            ? "Nothing here yet. Add a service or any item you sell that isn't stock."
            : "No items match."}
        </div>
      ) : (
        <div>
          <Table
            columns={columns}
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
        title={editing === "new" ? "Add catalogue item" : "Edit catalogue item"}
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
            <Button type="submit" form="catalogue-form" variant="primary" style={{ flex: 2 }}>
              {editing === "new" ? "Add item" : "Save changes"}
            </Button>
          </div>
        }
      >
        <form
          id="catalogue-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}
        >
          <FormField
            id="catalogue-name"
            label="NAME"
            span={12}
            error={touched ? problems.name : null}
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
                setNameTaken(null);
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
              options={categories.map((item) => ({ value: item, label: item }))}
              value={formCategory}
              placeholder="e.g. Services"
              creatable
              createLabel="Add new category"
              aria-invalid={touched && problems.category ? true : undefined}
              onChange={setFormCategory}
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

      <Modal open={deleting !== null} onClose={() => setDeleting(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Delete {deleting?.name}?</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            It will no longer appear at the Point of Sale. Past sales that included it are not
            changed.
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
              onClick={() => {
                if (deleting) deleteCatalogueItem(deleting.id);
                setDeleting(null);
                setNotice("Item deleted.");
                void reload();
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
