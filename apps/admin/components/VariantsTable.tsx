"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  IconButton,
  Input,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatPrice, stockStatus } from "../lib/stock-display";
import {
  addVariant,
  editVariant,
  listProducts,
  saveProducts,
  type Product,
  type Variant,
  type VariantInput,
} from "../lib/stocks";
import PageHeader from "./PageHeader";
import VariantSheet from "./VariantSheet";

export default function VariantsTable({ productId }: { productId: string }) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [products, setProducts] = useState<Product[] | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Variant | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listProducts().then(setProducts);
  }, []);

  // undefined = still loading, null = no such product.
  const product = products ? (products.find((row) => row.id === productId) ?? null) : undefined;

  function closeSheet() {
    setEditing(null);
    setAdding(false);
  }

  function handleSubmit(input: VariantInput): { sku: string; error: string } | null {
    if (!products) return null;
    const result = editing
      ? editVariant(products, productId, editing.sku, input)
      : addVariant(products, productId, input);
    if (!result.ok) return { sku: result.sku, error: result.error };
    setProducts(result.products);
    saveProducts(result.products);
    closeSheet();
    return null;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const variants = product?.variants ?? [];
    if (!q) return variants;
    return variants.filter(
      (variant) => variant.name.toLowerCase().includes(q) || variant.sku.toLowerCase().includes(q),
    );
  }, [product, query]);

  const columns: TableColumn<Variant>[] = [
    { key: "name", header: "Variant", width: "24%", render: (variant) => variant.name },
    {
      key: "sku",
      header: "SKU",
      render: (variant) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{variant.sku}</span>
      ),
    },
    {
      key: "price",
      header: "Selling price",
      render: (variant) => <span style={textStyle("data")}>{formatPrice(variant.price)}</span>,
    },
    {
      key: "purchasePrice",
      header: "Purchase price",
      render: (variant) => (
        <span style={textStyle("data")}>{formatPrice(variant.purchasePrice)}</span>
      ),
    },
    {
      key: "quantity",
      header: "Stock",
      render: (variant) => (
        <span style={textStyle("data")}>
          {variant.quantity} {variant.unit}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (variant) => {
        const status = stockStatus(variant.quantity);
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
        : !product.variants
          ? "This product doesn't have variants."
          : null;

  return (
    <div>
      <PageHeader
        title={product ? product.name : "Variants"}
        subtitle={
          product
            ? `${product.category}${product.subcategory ? ` / ${product.subcategory}` : ""} · ${
                product.variants?.length ?? 0
              } variants`
            : undefined
        }
        backHref="/stocks"
        backLabel="Back to stocks"
      />

      {product?.variants ? (
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
      ) : product?.variants && filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          No variants match your search.
        </div>
      ) : product?.variants ? (
        <Table
          columns={columns}
          rows={filtered}
          getRowKey={(variant) => variant.sku}
          onRowClick={(variant) =>
            router.push(
              `/stocks/${encodeURIComponent(product.id)}/current-stock?variant=${encodeURIComponent(variant.sku)}`,
            )
          }
        />
      ) : null}
      <VariantSheet
        open={adding || editing !== null}
        variant={editing}
        existingNames={(product?.variants ?? [])
          .filter((variant) => variant.sku !== editing?.sku)
          .map((variant) => variant.name)}
        defaultUnit={product?.unit}
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
