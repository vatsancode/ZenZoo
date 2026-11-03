"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
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
import { useAccess } from "../lib/access";
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
import { listCategoriesFlat, type CategoryResponse } from "../lib/catalogue";
import { formatPrice } from "../lib/stock-display";
import { listEmployees, type Employee } from "../features/employees/employees";
import ServiceSetupFields from "../features/slots/ServiceSetupFields";
import {
  EMPTY_SETUP_FORM,
  formFromSetup,
  itemTerms,
  getServiceSetup,
  saveServiceSetup,
  setupFromForm,
  setupProblem,
  type SetupForm,
} from "../features/slots/serviceSetup";
import CategoryPicker from "./CategoryPicker";
import FormField from "./FormField";
import ImportFromInventoryModal from "./ImportFromInventoryModal";
import { useSingleFlight } from "../lib/useSingleFlight";

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
  const { can } = useAccess();
  const canEdit = can("catalogue", "edit");
  const canDelete = can("catalogue", "delete");
  // Adding a category is a Settings write, not a Catalogue one.
  const canCreateCategory = can("settings", "edit");
  const { colors, spacing } = useTheme();
  const [items, setItems] = useState<CatalogueItem[] | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [kind, setKind] = useState<KindTab>("all");
  const { busy: saving, run: runSave } = useSingleFlight();
  const { busy: removing, run: runRemove } = useSingleFlight();
  // Opening the form waits for fresh categories; one open at a time, and the row being opened shows it.
  const { busy: opening, run: runOpen } = useSingleFlight();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // null = closed; an item = editing it; "new" = adding.
  const [editing, setEditing] = useState<CatalogueItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<CatalogueItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // The form's fields.
  const [name, setName] = useState("");
  // Real category ids - a new category is saved by the picker as soon as it is named.
  const [formCategory, setFormCategory] = useState("");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [pricing, setPricing] = useState<PricingMode>("fixed");
  const [price, setPrice] = useState("");
  // How long it takes and who does it, at what price and time - kept apart from the item itself.
  const [providers, setProviders] = useState<Employee[]>([]);
  const [setupForm, setSetupForm] = useState<SetupForm>(EMPTY_SETUP_FORM);
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
      return nextItems;
    } catch (reason) {
      setItems([]);
      setNotice(reason instanceof Error ? reason.message : "Couldn't load the catalogue.");
      return null;
    }
  }

  /** Re-reads the categories - Settings can change them while this page is open. Null if it couldn't. */
  async function refreshCategories(): Promise<CategoryResponse[] | null> {
    try {
      const fresh = await listCategoriesFlat();
      setCategories(fresh);
      return fresh;
    } catch {
      return null;
    }
  }

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

  // The search runs a moment after typing stops, so each letter doesn't re-filter the whole list.
  const [searchText, setSearchText] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // What each item's Category cell and search show ("Sarees › Silk"), worked out once per list.
  const labelByCategoryId = useMemo(
    () => new Map(categories.map((row) => [row.id, categoryLabel(row, categories)])),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (category !== ALL && item.categoryId !== category) return false;
      if (kind !== "all" && item.kind !== kind) return false;
      if (!q) return true;
      // Match the label the table shows ("Sarees › Silk"), so the parent category finds it too.
      const label = labelByCategoryId.get(item.categoryId) ?? item.category;
      return item.name.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    });
  }, [items, labelByCategoryId, searchText, category, kind]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function openForm(target: CatalogueItem | "new") {
    // An imported product is edited on the Stocks side - its price and name live there.
    if (target !== "new" && target.kind === "product") return;
    return runOpen(async () => {
      setOpeningId(target === "new" ? "new" : target.id);
      try {
        await fillForm(target);
      } finally {
        setOpeningId(null);
      }
    });
  }

  async function fillForm(target: CatalogueItem | "new") {
    // Fill the form from the categories as they are now, not as they were when the page opened.
    const rows = (await refreshCategories()) ?? categories;
    setEditing(target);
    setName(target === "new" ? "" : target.name);
    // An item filed under a subcategory opens with its parent in Category and itself in Subcategory.
    const current = target === "new" ? undefined : rows.find((row) => row.id === target.categoryId);
    setFormCategory(current?.parentId ?? current?.id ?? "");
    setFormSubcategory(current?.parentId ? current.id : "");
    setPricing(target === "new" ? "fixed" : target.pricing);
    setPrice(target === "new" || target.price === undefined ? "" : String(target.price));
    // Only the active employees can be offered; the employees list is a separate area, so a role
    // without access to it simply sees no providers to pick.
    const [staff, setup] = await Promise.all([
      listEmployees().catch(() => [] as Employee[]),
      target === "new" ? null : getServiceSetup(target.id),
    ]);
    setProviders(staff.filter((employee) => employee.status === "active"));
    setSetupForm(formFromSetup(setup));
    setTouched(false);
    setSaveError(null);
  }

  const value = price.trim() === "" ? 0 : Number(price);
  const problems = {
    name: name.trim() === "" ? "Enter a name." : null,
    category: formCategory.trim() === "" ? "Choose or type a category." : null,
    price:
      !setupForm.customised && pricing === "fixed" && (Number.isNaN(value) || value <= 0)
        ? "Enter the price."
        : null,
    setup: setupProblem(setupForm),
  };
  const valid = Object.values(problems).every((item) => item === null);

  function submit() {
    return runSave(async () => {
      setTouched(true);
      if (!valid || !editing) return;
      setSaveError(null);

      const input = {
        name: name.trim(),
        categoryId: formSubcategory || formCategory,
        ...itemTerms(setupForm, pricing, value),
      };
      const message =
        editing === "new"
          ? await addCatalogueItem(input)
          : await editCatalogueItem(editing.id, input);
      if (message) {
        setSaveError(message);
        // The failure may be a category deleted meanwhile - refresh, and drop a pick that is gone.
        const fresh = await refreshCategories();
        if (fresh) {
          const gone = (id: string) => id !== "" && !fresh.some((row) => row.id === id);
          if (gone(formCategory)) {
            setFormCategory("");
            setFormSubcategory("");
          } else if (gone(formSubcategory)) {
            setFormSubcategory("");
          }
        }
        return;
      }
      setNotice(
        editing === "new" ? `${name.trim()} added to the catalogue.` : `${name.trim()} updated.`,
      );
      const added = editing === "new" ? name.trim().toLowerCase() : null;
      setEditing(null);
      const fresh = await reload();
      // A new item's id is only known once it is in the list, so look it up by its name.
      const savedId =
        editing === "new"
          ? fresh?.find(
              (item) => item.kind === "made_to_order" && item.name.trim().toLowerCase() === added,
            )?.id
          : editing.id;
      if (savedId) await saveServiceSetup(savedId, setupFromForm(setupForm));
      if (added && fresh) {
        // The list is A-Z, so the new item may be on any page: clear the filters and go to its page.
        const index = fresh.findIndex((item) => item.name.trim().toLowerCase() === added);
        setQuery("");
        setCategory(ALL);
        setKind("all");
        setPage(index < 0 ? 1 : Math.floor(index / pageSize) + 1);
      }
    });
  }

  function confirmDelete() {
    return runRemove(async () => {
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
    });
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
      render: (item) => labelByCategoryId.get(item.categoryId) ?? item.category,
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
              label={
                opening && openingId === item.id ? `Opening ${item.name}...` : `Edit ${item.name}`
              }
              disabled={opening}
              onClick={(event) => {
                event.stopPropagation();
                void openForm(item);
              }}
            />
          ) : null}
          {/* Removing a product from the catalogue is an edit; deleting a made-to-order item is a delete. */}
          {item.kind === "product" || canDelete ? (
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
          ) : null}
        </span>
      ),
    },
  ];

  const counts = useMemo(() => {
    const result: Record<CatalogueKind, number> = { made_to_order: 0, product: 0 };
    for (const item of items ?? []) result[item.kind] += 1;
    return result;
  }, [items]);
  const count = (which: CatalogueKind) => counts[which];
  const kindTabs = [
    { id: "all", label: `All (${items?.length ?? 0})` },
    { id: "made_to_order", label: `${KIND_LABEL.made_to_order} (${count("made_to_order")})` },
    { id: "product", label: `${KIND_LABEL.product} (${count("product")})` },
  ];
  // The Type column only tells rows apart on "All" - each other tab is one type already.
  const shownColumns = columns.filter(
    (column) => (kind === "all" || column.key !== "kind") && (canEdit || column.key !== "actions"),
  );

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
          {canEdit ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setImporting(true)}>
                Import from inventory
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={opening && openingId === "new"}
                disabled={opening}
                onClick={() => void openForm("new")}
              >
                Add item
              </Button>
            </>
          ) : null}
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
            // The form is for changing an item, so a role that can only view gets no row action.
            onRowClick={canEdit ? (item) => void openForm(item) : undefined}
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
        width={600}
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
            error={touched ? problems.name : null}
          >
            <Input
              id="catalogue-name"
              autoFocus
              autoComplete="off"
              placeholder="e.g. Blouse stitching"
              maxLength={200}
              value={name}
              aria-invalid={touched && problems.name ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setSaveError(null);
              }}
            />
          </FormField>
          {/* The picker's two fields place themselves on a 12-column grid: half a row each. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              columnGap: spacing[3],
              alignItems: "start",
            }}
          >
            <CategoryPicker
              idPrefix="catalogue"
              span={6}
              categories={categories}
              categoryId={formCategory}
              subcategoryId={formSubcategory}
              canCreate={canCreateCategory}
              error={touched ? problems.category : null}
              onCreated={(row) => setCategories((current) => [...current, row])}
              onChange={(next) => {
                setFormCategory(next.categoryId);
                setFormSubcategory(next.subcategoryId);
              }}
            />
          </div>
          <ServiceSetupFields
            employees={providers}
            value={setupForm}
            onChange={setSetupForm}
            pricing={pricing}
            onPricingChange={setPricing}
            price={price}
            onPriceChange={setPrice}
            priceError={touched ? problems.price : null}
            error={touched ? problems.setup : null}
          />
          {saveError ? (
            <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
              {saveError}
            </div>
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

      <Modal
        open={deleting !== null}
        onClose={removing ? () => undefined : () => setDeleting(null)}
      >
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
            <Button
              type="button"
              variant="secondary"
              disabled={removing}
              onClick={() => setDeleting(null)}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removing}
              onClick={() => void confirmDelete()}
            >
              {removing
                ? deleting?.kind === "product"
                  ? "Removing..."
                  : "Deleting..."
                : deleting?.kind === "product"
                  ? "Remove"
                  : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
