"use client";

import { useTheme, type ColorTokens, type Spacing } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  IconButton,
  Input,
  Notice,
  Pagination,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createProduct,
  listRealProducts,
  updateProduct,
  updateProductUnit,
  updateVariant,
  type RealProduct,
} from "../../lib/realProducts";
import { listCurrentStock } from "../../lib/realStock";
import { formatPrice, stockStatus } from "../../lib/stock-display";
import { listCategoriesFlat, type CategoryResponse } from "../../lib/catalogue";
import { listUnits, unitOptions, type Unit as RealUnit } from "../settings/units";
import AddStockSheet, { type StockFormInput } from "../../components/AddStockSheet";

// A single price, or "low - high" when a product's variants are priced differently.
function priceLabel(product: RealProduct): string {
  const prices = product.variants.map((variant) => Number(variant.basePrice));
  if (prices.length === 0) return formatPrice(0);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? formatPrice(low) : `${formatPrice(low)} - ${formatPrice(high)}`;
}

// A product with exactly one variant goes straight to its stock; more than
// one opens the variant list first - mirrors the old "simple vs variant
// product" split, except every real product always has >=1 variant.
function productHref(product: RealProduct): string {
  if (product.variants.length === 1) {
    return `/stocks/${encodeURIComponent(product.id)}/current-stock?variant=${encodeURIComponent(product.variants[0]!.id)}`;
  }
  return `/stocks/${encodeURIComponent(product.id)}/variants`;
}

export default function StocksTable() {
  const { colors, spacing } = useTheme();
  const [products, setProducts] = useState<RealProduct[] | null>(null);
  // null while loading - distinct from an empty {}, so a row with real
  // stock can't flash "Out of stock" before the real count has arrived.
  const [stock, setStock] = useState<Record<string, number> | null>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<RealProduct | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [units, setUnits] = useState<RealUnit[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);

  function refresh() {
    listRealProducts().then(setProducts);
  }

  useEffect(() => {
    refresh();
    listCurrentStock().then(setStock);
    listUnits().then(setUnits);
    listCategoriesFlat().then(setCategories);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function closeSheet() {
    setAddOpen(false);
    setEditing(null);
  }

  // Editing a product that has only its one starting variant edits both the
  // product (name/category) and that variant (SKU/price) - a real
  // multi-variant product only ever has its name/category touched here, the
  // rest stays on the variants page, same as the form itself already shows.
  // Unit is the one field that's genuinely product-wide: changing it bulk-
  // updates every variant, regardless of how many there are.
  async function handleSubmit(input: StockFormInput): Promise<{ sku: string; error: string } | null> {
    if (editing) {
      const productResult = await updateProduct(editing.id, {
        name: input.name,
        categoryId: input.categoryId,
      });
      if (typeof productResult === "string") return { sku: input.sku, error: productResult };

      if (input.unitId !== editing.variants[0]?.unitId) {
        const unitResult = await updateProductUnit(editing.id, input.unitId);
        if (typeof unitResult === "string") return { sku: input.sku, error: unitResult };
      }

      if (editing.variantCount === 1) {
        const soleVariant = editing.variants[0]!;
        const variantResult = await updateVariant(soleVariant.id, {
          name: input.name,
          sku: input.sku || undefined,
          basePrice: input.price,
        });
        if (typeof variantResult === "string") return { sku: input.sku, error: variantResult };
      }

      closeSheet();
      setNotice(`${input.name} updated.`);
      refresh();
      return null;
    }

    const result = await createProduct({
      name: input.name,
      variantName: input.hasVariants ? input.variantName : undefined,
      sku: input.sku || undefined,
      basePrice: input.price,
      unitId: input.unitId,
      categoryId: input.categoryId,
      openingQuantity: input.openingQuantity || undefined,
      openingUnitCost: input.openingQuantity ? input.openingUnitCost : undefined,
    });
    if (typeof result === "string") return { sku: input.sku, error: result };

    closeSheet();
    // Route by what was asked for (the toggle), not the variant count a
    // freshly-created product happens to have - "Has variants" on still
    // only creates the one, first variant, same count as "off" would, so
    // the count alone can't tell them apart yet.
    router.push(
      input.hasVariants
        ? `/stocks/${encodeURIComponent(result.id)}/variants`
        : `/stocks/${encodeURIComponent(result.id)}/current-stock?variant=${encodeURIComponent(result.variants[0]!.id)}`,
    );
    return null;
  }

  const existingNames = (products ?? [])
    .filter((product) => product.id !== editing?.id)
    .map((product) => product.name);

  const onHandFor = (product: RealProduct) =>
    product.variants.reduce((sum, variant) => sum + (stock?.[variant.id] ?? 0), 0);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        product.variants.some(
          (variant) =>
            variant.name.toLowerCase().includes(q) || (variant.sku ?? "").toLowerCase().includes(q),
        ),
    );
  }, [products, query]);

  // Stay on a real page even if the list shrinks (e.g. after typing in the search box).
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const columns: TableColumn<RealProduct>[] = [
    { key: "name", header: "Product", width: "28%", render: (product) => product.name },
    {
      key: "sku",
      header: "SKU",
      render: (product) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
          {product.variants.length === 1
            ? product.variants[0]!.sku ?? "-"
            : `${product.variants.length} variants`}
        </span>
      ),
    },
    {
      key: "price",
      header: "Price",
      render: (product) => <span style={textStyle("data")}>{priceLabel(product)}</span>,
    },
    {
      key: "quantity",
      header: "Stock",
      render: (product) => (
        <span style={textStyle("data")}>{stock ? onHandFor(product) : "..."}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (product) => {
        if (!stock) return null;
        const status = stockStatus(onHandFor(product));
        return <Badge tone={status.tone}>{status.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      width: "88px",
      render: (product) => (
        <IconButton
          icon="edit"
          label={`Edit ${product.name}`}
          onClick={(event) => {
            event.stopPropagation();
            setEditing(product);
          }}
        />
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[4],
          marginBottom: spacing[6],
        }}
      >
        <div style={{ maxWidth: 360, width: "100%" }}>
          <Input
            type="search"
            placeholder="Search products, SKUs..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            aria-label="Search products"
          />
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          Add new product
        </Button>
      </div>

      {notice ? <Notice style={{ marginBottom: spacing[4] }}>{notice}</Notice> : null}

      {products === null ? (
        <EmptyState colors={colors} spacing={spacing} message="Loading products..." />
      ) : filtered.length === 0 ? (
        <EmptyState colors={colors} spacing={spacing} message="No products match your search." />
      ) : (
        <>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(product) => product.id}
            onRowClick={(product) => router.push(productHref(product))}
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
        </>
      )}
      <AddStockSheet
        open={addOpen || editing !== null}
        existingNames={existingNames}
        product={editing}
        unitOptions={unitOptions(units)}
        categories={categories}
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function EmptyState({
  colors,
  spacing,
  message,
}: {
  colors: ColorTokens;
  spacing: Spacing;
  message: string;
}) {
  return (
    <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
      {message}
    </div>
  );
}
