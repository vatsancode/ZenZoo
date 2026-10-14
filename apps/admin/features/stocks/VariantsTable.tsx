"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, IconButton, Input, Table, textStyle, type TableColumn } from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatPrice, stockStatus } from "../../lib/stock-display";
import {
  createVariant,
  listRealProducts,
  updateVariant,
  type RealProduct,
  type RealVariant,
} from "../../lib/realProducts";
import { listCurrentStock } from "../../lib/realStock";
import type { Variant, VariantInput } from "./stocks";
import PageHeader from "../../components/PageHeader";
import VariantSheet from "../../components/VariantSheet";

// Shapes a real variant the way VariantSheet expects to seed its fields for editing.
function toSheetVariant(variant: RealVariant, stock: Record<string, number> | null): Variant {
  return {
    name: variant.name,
    sku: variant.sku ?? "",
    price: Number(variant.basePrice),
    purchasePrice: 0,
    quantity: stock?.[variant.id] ?? 0,
    unit: variant.unitId,
  };
}

export default function VariantsTable({ productId }: { productId: string }) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [products, setProducts] = useState<RealProduct[] | undefined>(undefined);
  // null while loading - distinct from an empty {}, so a row with real
  // stock can't flash "Out of stock" before the real count has arrived.
  const [stock, setStock] = useState<Record<string, number> | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RealVariant | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listRealProducts().then(setProducts);
    listCurrentStock().then(setStock);
  }, []);

  // undefined = still loading, null = no such product.
  const product = products ? (products.find((row) => row.id === productId) ?? null) : undefined;

  // Stable references - VariantSheet re-seeds its fields whenever these
  // change identity, so recomputing them on every render (even when
  // `editing`/`units` haven't actually changed) would wipe out whatever the
  // user had already typed.
  const sheetVariant = useMemo(
    () => (editing ? toSheetVariant(editing, stock) : null),
    [editing, stock],
  );

  function closeSheet() {
    setEditing(null);
    setAdding(false);
  }

  async function handleSubmit(input: VariantInput): Promise<{ sku: string; error: string } | null> {
    if (!product) {
      closeSheet();
      return null;
    }
    const result = editing
      ? await updateVariant(editing.id, {
          name: input.name,
          sku: input.sku.trim() === "" ? undefined : input.sku,
          basePrice: input.price,
        })
      : await createVariant(product.id, {
          name: input.name,
          sku: input.sku.trim() === "" ? undefined : input.sku,
          basePrice: input.price,
          openingQuantity: input.quantity || undefined,
          openingUnitCost: input.quantity ? input.purchasePrice : undefined,
        });
    if (typeof result === "string") return { sku: input.sku, error: result };
    setProducts((current) => current?.map((row) => (row.id === result.id ? result : row)));
    listCurrentStock().then(setStock);
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
      render: (variant) => (
        <span style={textStyle("data")}>{stock ? (stock[variant.id] ?? 0) : "..."}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (variant) => {
        if (!stock) return null;
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
        variant={sheetVariant}
        existingNames={(product?.variants ?? [])
          .filter((variant) => variant.id !== editing?.id)
          .map((variant) => variant.name)}
        allowZeroStock
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
