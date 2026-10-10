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
import { addStock, editProduct, listProducts, saveProducts, type AddStockInput, type Product } from "./stocks";
import { listRealProducts, type RealProduct } from "../../lib/realProducts";
import { listCurrentStock } from "../../lib/realStock";
import { formatPrice, stockStatus } from "../../lib/stock-display";
import AddStockSheet from "../../components/AddStockSheet";

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
  const [stock, setStock] = useState<Record<string, number>>({});
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The mock catalogue, kept only to feed AddStockSheet - see this file's
  // own note on why Add/Edit still targets it while the list above is real.
  const [mockProducts, setMockProducts] = useState<Product[]>([]);

  useEffect(() => {
    listRealProducts().then(setProducts);
    listCurrentStock().then(setStock);
    listProducts().then(setMockProducts);
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

  // One sheet serves both: adding a new product, or editing the clicked row.
  // Both still only ever touch the mock catalogue (see this file's own
  // note) - they never affect what the real table above is showing.
  function handleSubmit(input: AddStockInput): { sku: string; error: string } | null {
    const result = editing
      ? editProduct(mockProducts, editing.id, input)
      : addStock(mockProducts, input);
    if (!result.ok) return { sku: result.sku, error: result.error };
    setMockProducts(result.products);
    saveProducts(result.products);
    closeSheet();
    const { product } = result;
    setNotice(
      `${product.name} ${editing ? "updated" : "added"} in the sample catalogue (not the list below yet).`,
    );
    return null;
  }

  const onHandFor = (product: RealProduct) =>
    product.variants.reduce((sum, variant) => sum + (stock[variant.id] ?? 0), 0);

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
      render: (product) => <span style={textStyle("data")}>{onHandFor(product)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (product) => {
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
            // There's no real id->mock id mapping, so this is a best-effort
            // name match into the sample catalogue, same "wired to the mock
            // anyway" tradeoff as the rest of this file - matches nothing
            // and opens as Add when no mock product shares this name.
            const match = mockProducts.find((row) => row.name === product.name) ?? null;
            setEditing(match);
            if (!match) setAddOpen(true);
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
        products={mockProducts}
        product={editing}
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
