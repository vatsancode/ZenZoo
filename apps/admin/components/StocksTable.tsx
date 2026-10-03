"use client";

import { useTheme, type ColorTokens, type Spacing } from "@zenzoo/design-tokens";
import { Badge, Input, Table, textStyle, type TableColumn } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { listProducts, type Product } from "../lib/stocks";

function stockStatus(quantity: number): { tone: "success" | "warning" | "danger"; label: string } {
  if (quantity === 0) return { tone: "danger", label: "Out of stock" };
  if (quantity <= 10) return { tone: "warning", label: "Low stock" };
  return { tone: "success", label: "In stock" };
}

export default function StocksTable() {
  const { colors, spacing } = useTheme();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    listProducts().then(setProducts);
  }, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q),
    );
  }, [products, query]);

  const columns: TableColumn<Product>[] = [
    { key: "name", header: "Product", render: (product) => product.name },
    {
      key: "sku",
      header: "SKU",
      render: (product) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{product.sku}</span>
      ),
    },
    { key: "category", header: "Category", render: (product) => product.category },
    {
      key: "price",
      header: "Price",
      align: "right",
      render: (product) => <span style={textStyle("data")}>${product.price.toFixed(2)}</span>,
    },
    {
      key: "quantity",
      header: "Stock",
      align: "right",
      render: (product) => <span style={textStyle("data")}>{product.quantity}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (product) => {
        const status = stockStatus(product.quantity);
        return <Badge tone={status.tone}>{status.label}</Badge>;
      },
    },
  ];

  return (
    <div>
      <div style={{ maxWidth: 360, marginBottom: spacing[6] }}>
        <Input
          type="search"
          placeholder="Search products, SKUs, categories..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search products"
        />
      </div>

      {products === null ? (
        <EmptyState colors={colors} spacing={spacing} message="Loading products..." />
      ) : filtered.length === 0 ? (
        <EmptyState colors={colors} spacing={spacing} message="No products match your search." />
      ) : (
        <Table columns={columns} rows={filtered} getRowKey={(product) => product.sku} />
      )}
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
