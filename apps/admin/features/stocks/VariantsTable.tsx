"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, IconButton, Input, Table, textStyle, type TableColumn } from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatPrice, stockStatus } from "../../lib/stock-display";
import { listRealProducts, type RealProduct, type RealVariant } from "../../lib/realProducts";
import { listCurrentStock } from "../../lib/realStock";
import {
  addVariant,
  editVariant,
  listProducts,
  saveProducts,
  type Product,
  type VariantInput,
} from "./stocks";
import PageHeader from "../../components/PageHeader";
import VariantSheet from "../../components/VariantSheet";

export default function VariantsTable({ productId }: { productId: string }) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [products, setProducts] = useState<RealProduct[] | undefined>(undefined);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RealVariant | null>(null);
  const [adding, setAdding] = useState(false);
  // Kept only to feed VariantSheet - see StocksTable.tsx's own note on why
  // Add/Edit still targets the mock catalogue.
  const [mockProducts, setMockProducts] = useState<Product[]>([]);

  useEffect(() => {
    listRealProducts().then(setProducts);
    listCurrentStock().then(setStock);
    listProducts().then(setMockProducts);
  }, []);

  // undefined = still loading, null = no such product.
  const product = products ? (products.find((row) => row.id === productId) ?? null) : undefined;
  const mockProduct = mockProducts.find((row) => row.name === product?.name) ?? null;

  function closeSheet() {
    setEditing(null);
    setAdding(false);
  }

  function handleSubmit(input: VariantInput): { sku: string; error: string } | null {
    // Best-effort only, same tradeoff as StocksTable.tsx - there's no real
    // id to tie this mock edit back to, so it edits the sample catalogue's
    // own copy (if one matched by name) and never affects the real row.
    if (!mockProduct) {
      closeSheet();
      return null;
    }
    const result = editing
      ? editVariant(mockProducts, mockProduct.id, editing.sku ?? "", input)
      : addVariant(mockProducts, mockProduct.id, input);
    if (!result.ok) return { sku: result.sku, error: result.error };
    setMockProducts(result.products);
    saveProducts(result.products);
    closeSheet();
    return null;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const variants = product?.variants ?? [];
    if (!q) return variants;
    return variants.filter(
      (variant) =>
        variant.name.toLowerCase().includes(q) || (variant.sku ?? "").toLowerCase().includes(q),
    );
  }, [product, query]);

  const columns: TableColumn<RealVariant>[] = [
    { key: "name", header: "Variant", width: "24%", render: (variant) => variant.name },
    {
      key: "sku",
      header: "SKU",
      render: (variant) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
          {variant.sku ?? "-"}
        </span>
      ),
    },
    {
      key: "price",
      header: "Selling price",
      render: (variant) => (
        <span style={textStyle("data")}>{formatPrice(Number(variant.basePrice))}</span>
      ),
    },
    {
      key: "quantity",
      header: "Stock",
      render: (variant) => <span style={textStyle("data")}>{stock[variant.id] ?? 0}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (variant) => {
        const status = stockStatus(stock[variant.id] ?? 0);
        return <Badge tone={status.tone}>{status.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      width: "88px",
      render: (variant) => (
        <IconButton
          icon="edit"
          label={`Edit ${variant.name}`}
          onClick={(event) => {
            event.stopPropagation();
            setEditing(variant);
          }}
        />
      ),
    },
  ];

  const message =
    product === undefined
      ? "Loading variants..."
      : product === null
        ? "We couldn't find this product."
        : null;

  return (
    <div>
      <PageHeader
        title={product ? product.name : "Variants"}
        subtitle={product ? `${product.variants.length} variants` : undefined}
        backHref="/stocks"
        backLabel="Back to stocks"
      />

      {product ? (
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
              placeholder="Search variants, SKUs..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search variants"
            />
          </div>
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add new variant
          </Button>
        </div>
      ) : null}

      {message ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          {message}
        </div>
      ) : product && filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          No variants match your search.
        </div>
      ) : product ? (
        <Table
          columns={columns}
          rows={filtered}
          getRowKey={(variant) => variant.id}
          onRowClick={(variant) =>
            router.push(
              `/stocks/${encodeURIComponent(product.id)}/current-stock?variant=${encodeURIComponent(variant.id)}`,
            )
          }
        />
      ) : null}
      <VariantSheet
        open={adding || editing !== null}
        variant={null}
        existingNames={(mockProduct?.variants ?? []).map((variant) => variant.name)}
        defaultUnit={mockProduct?.unit}
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
