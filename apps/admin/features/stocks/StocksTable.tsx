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
  addStock,
  editProduct,
  listProducts,
  saveProducts,
  type AddStockInput,
  type Product,
} from "./stocks";
import { formatPrice, stockStatus } from "../../lib/stock-display";
import AddStockSheet from "../../components/AddStockSheet";

// A single price, or "low - high" when a product's variants are priced differently.
function priceLabel(product: Product): string {
  const prices = (product.variants ?? []).map((variant) => variant.price);
  const low = prices.length > 0 ? Math.min(...prices) : product.price;
  const high = prices.length > 0 ? Math.max(...prices) : product.price;
  return low === high ? formatPrice(low) : `${formatPrice(low)} - ${formatPrice(high)}`;
}

// Products with variants open their variant list; others open their current stock.
function productHref(product: Product): string {
  const page = product.variants ? "variants" : "current-stock";
  return `/stocks/${encodeURIComponent(product.id)}/${page}`;
}

export default function StocksTable() {
  const { colors, spacing } = useTheme();
  const [products, setProducts] = useState<Product[] | null>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listProducts().then(setProducts);
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
  function handleSubmit(input: AddStockInput): { sku: string; error: string } | null {
    if (!products) return null;
    const result = editing ? editProduct(products, editing.id, input) : addStock(products, input);
    if (!result.ok) return { sku: result.sku, error: result.error };
    setProducts(result.products);
    saveProducts(result.products);
    // A new product lands at the top of the list, so go there to show it.
    if (!editing) setPage(1);
    closeSheet();
    const { product } = result;
    const variantCount = product.variants?.length ?? 0;
    setNotice(
      editing
        ? `${product.name} updated.`
        : variantCount > 0
          ? `${product.name} added with ${variantCount} variants - ${product.quantity} in stock.`
          : `${product.name} added - ${product.quantity} in stock.`,
    );
    return null;
  }

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q) ||
        (product.variants ?? []).some(
          (variant) =>
            variant.name.toLowerCase().includes(q) || variant.sku.toLowerCase().includes(q),
        ),
    );
  }, [products, query]);

  // Stay on a real page even if the list shrinks (e.g. after typing in the search box).
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const columns: TableColumn<Product>[] = [
    { key: "name", header: "Product", width: "28%", render: (product) => product.name },
    {
      key: "sku",
      header: "SKU",
      render: (product) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
          {product.variants ? `${product.variants.length} variants` : product.sku}
        </span>
      ),
    },
    { key: "category", header: "Category", render: (product) => product.category },
    {
      key: "price",
      header: "Price",
      render: (product) => <span style={textStyle("data")}>{priceLabel(product)}</span>,
    },
    {
      key: "quantity",
      header: "Stock",
      render: (product) => (
        <span style={textStyle("data")}>
          {product.quantity}
          {product.unit ? ` ${product.unit}` : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (product) => {
        const status = stockStatus(product.quantity);
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
            placeholder="Search products, SKUs, categories..."
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
        products={products ?? []}
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
