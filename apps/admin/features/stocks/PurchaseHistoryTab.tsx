"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Table, textStyle, type TableColumn } from "@zenzoo/ui-web";
import { formatPrice } from "../../lib/stock-display";
import { formatDate, type StockItem } from "./stock-history";
import type { VariantPurchaseLine } from "../purchases/purchases";
import StatTile, { StatRow } from "../../components/StatTile";

/** The real purchase history for this variant - every line, across every purchase, that ordered it. Empty for a variant nothing has been bought for yet. */
export default function PurchaseHistoryTab({
  item,
  purchases,
  supplierName,
}: {
  item: StockItem;
  purchases: VariantPurchaseLine[];
  supplierName: (supplierId: string) => string;
}) {
  const { colors, spacing } = useTheme();

  const totalQuantity = purchases.reduce((sum, row) => sum + row.quantity, 0);
  const totalSpent = purchases.reduce((sum, row) => sum + row.total, 0);
  const averageCost = totalQuantity > 0 ? Math.round(totalSpent / totalQuantity) : 0;
  const latest = purchases[0];

  const columns: TableColumn<VariantPurchaseLine>[] = [
    { key: "date", header: "Date", render: (row) => formatDate(row.date) },
    {
      key: "reference",
      header: "Purchase no.",
      render: (row) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
          {row.reference ?? "-"}
        </span>
      ),
    },
    { key: "vendor", header: "Vendor", width: "24%", render: (row) => supplierName(row.supplierId) },
    {
      key: "quantity",
      header: "Quantity",
      render: (row) => (
        <span style={textStyle("data")}>
          {row.quantity} {item.unit}
        </span>
      ),
    },
    {
      key: "unitCost",
      header: "Cost per unit",
      render: (row) => <span style={textStyle("data")}>{formatPrice(row.unitCost)}</span>,
    },
    {
      key: "total",
      header: "Total",
      render: (row) => <span style={textStyle("data")}>{formatPrice(row.total)}</span>,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <StatRow>
        <StatTile
          label="Total purchased"
          value={`${totalQuantity} ${item.unit}`}
          hint={`${purchases.length} purchases`}
        />
        <StatTile label="Total spent" value={formatPrice(totalSpent)} />
        <StatTile label="Average cost" value={formatPrice(averageCost)} hint={`per ${item.unit}`} />
        <StatTile
          label="Last purchase"
          value={latest ? formatDate(latest.date) : "-"}
          hint={latest ? supplierName(latest.supplierId) : undefined}
        />
      </StatRow>
      {purchases.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Nothing has been purchased for this variant yet.
        </div>
      ) : (
        <Table columns={columns} rows={purchases} getRowKey={(row) => row.id} />
      )}
    </div>
  );
}
