"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Chips, Table, textStyle, type BadgeTone, type TableColumn } from "@zenzoo/ui-web";
import { useState } from "react";
import { formatPrice } from "../../lib/stock-display";
import { formatDate, type Movement, type MovementType, type StockItem } from "./stock-history";
import StatTile, { StatRow } from "../../components/StatTile";

const TONES: Record<MovementType, BadgeTone> = {
  Sale: "neutral",
  Return: "success",
  "Used/out": "warning",
  Added: "success",
  Purchased: "success",
  "Opening stock": "success",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "purchased", label: "Purchases" },
  { value: "opening", label: "Opening stock" },
  { value: "removed", label: "Used/out" },
  { value: "added", label: "Added" },
];

const FILTER_TYPES: Record<string, MovementType[]> = {
  purchased: ["Purchased"],
  opening: ["Opening stock"],
  removed: ["Used/out"],
  added: ["Added"],
};

function signed(quantity: number, unit: string): string {
  return `${quantity > 0 ? "+" : "−"}${Math.abs(quantity)} ${unit}`;
}

/** The real stock_movements ledger for this variant - append-only, nothing here can be edited or undone. */
export default function StockMovementsTab({
  item,
  movements,
}: {
  item: StockItem;
  movements: Movement[];
}) {
  const { colors, spacing } = useTheme();
  const [filter, setFilter] = useState("all");

  // Net units sold: sales minus anything customers brought back.
  const sold = movements
    .filter((row) => row.type === "Sale" || row.type === "Return")
    .reduce((sum, row) => sum - row.quantity, 0);
  const purchased = movements
    .filter((row) => row.type === "Purchased")
    .reduce((sum, row) => sum + row.quantity, 0);
  const opening = movements
    .filter((row) => row.type === "Opening stock")
    .reduce((sum, row) => sum + row.quantity, 0);
  const removed = movements
    .filter((row) => row.type === "Used/out")
    .reduce((sum, row) => sum - row.quantity, 0);
  const added = movements
    .filter((row) => row.type === "Added")
    .reduce((sum, row) => sum + row.quantity, 0);

  const shown =
    filter === "all"
      ? movements
      : movements.filter((row) => FILTER_TYPES[filter]?.includes(row.type));

  const columns: TableColumn<Movement>[] = [
    { key: "date", header: "Date", render: (row) => formatDate(row.date) },
    {
      key: "type",
      header: "Type",
      width: "20%",
      render: (row) => <Badge tone={TONES[row.type]}>{row.type}</Badge>,
    },
    {
      key: "reference",
      header: "Reference",
      width: "28%",
      render: (row) => <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{row.reference}</span>,
    },
    {
      key: "quantity",
      header: "Quantity",
      render: (row) => <span style={textStyle("data")}>{signed(row.quantity, item.unit)}</span>,
    },
    {
      key: "amount",
      header: "Value",
      render: (row) => (
        <span style={textStyle("data")}>{row.amount === null ? "-" : formatPrice(row.amount)}</span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <StatRow>
        <StatTile label="Purchased" value={`${purchased} ${item.unit}`} hint="From received deliveries" />
        <StatTile label="Opening stock" value={`${opening} ${item.unit}`} hint="Starting balance, not a purchase" />
        <StatTile label="Sold" value={`${sold} ${item.unit}`} hint="No sales capability yet" />
        <StatTile label="Used/out" value={`${removed} ${item.unit}`} hint={`${added} ${item.unit} added back`} />
      </StatRow>

      <Chips aria-label="Show movements" options={FILTERS} value={filter} onChange={setFilter} />

      {shown.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Nothing in this group yet.
        </div>
      ) : (
        <Table columns={columns} rows={shown} getRowKey={(row) => row.id} />
      )}
    </div>
  );
}
