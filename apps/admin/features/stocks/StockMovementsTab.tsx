"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Chips, Table, textStyle, type BadgeTone, type TableColumn } from "@zenzoo/ui-web";
import { useMemo, useState } from "react";
import { formatPrice } from "../../lib/stock-display";
import { formatDate, type Movement, type MovementType, type RecordedMovement, type StockItem } from "./stock-history";
import StatTile, { StatRow } from "../../components/StatTile";

const TONES: Record<MovementType, BadgeTone> = {
  Sale: "neutral",
  Return: "success",
  Removed: "warning",
  Added: "success",
  Counted: "neutral",
  Purchased: "success",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "purchased", label: "Purchases" },
  { value: "removed", label: "Removed" },
  { value: "added", label: "Added" },
  { value: "counted", label: "Counts" },
];

const FILTER_TYPES: Record<string, MovementType[]> = {
  purchased: ["Purchased"],
  removed: ["Removed"],
  added: ["Added"],
  counted: ["Counted"],
};

function signed(quantity: number, unit: string): string {
  return `${quantity > 0 ? "+" : "−"}${Math.abs(quantity)} ${unit}`;
}

function isRecorded(row: Movement): row is RecordedMovement {
  return "batchId" in row;
}

/**
 * The real stock_movements ledger (type "Purchased", from receivePurchase)
 * merged with movements recorded this session via Record Movement - the
 * latter are local-only and never reach the server, see CurrentStockView.
 */
export default function StockMovementsTab({
  item,
  recorded,
  historical,
  onUndo,
}: {
  item: StockItem;
  /** Movements recorded this session via Record Movement - local only. */
  recorded: RecordedMovement[];
  /** The real stock_movements ledger for this variant. */
  historical: Movement[];
  onUndo: (movement: RecordedMovement) => void;
}) {
  const { colors, spacing } = useTheme();
  const [filter, setFilter] = useState("all");
  const movements = useMemo(() => [...recorded, ...historical], [recorded, historical]);

  // Net units sold: sales minus anything customers brought back. Entries that
  // were undone, and the undo entries themselves, cancel out and aren't counted.
  const counted = movements.filter((row) => !(isRecorded(row) && (row.reversed || row.isReversal)));
  const sold = counted
    .filter((row) => row.type === "Sale" || row.type === "Return")
    .reduce((sum, row) => sum - row.quantity, 0);
  const purchased = counted
    .filter((row) => row.type === "Purchased")
    .reduce((sum, row) => sum + row.quantity, 0);
  const removed = counted
    .filter((row) => row.type === "Removed")
    .reduce((sum, row) => sum - row.quantity, 0);
  const added = counted
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
      render: (row) => (
        <span style={{ display: "inline-flex", gap: spacing[2], flexWrap: "wrap" }}>
          <Badge tone={TONES[row.type]}>{row.type}</Badge>
          {isRecorded(row) && row.reversed ? <Badge>Undone</Badge> : null}
          {isRecorded(row) && row.isReversal ? <Badge>Undo</Badge> : null}
        </span>
      ),
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
    {
      key: "undo",
      header: "",
      align: "right",
      width: "88px",
      render: (row) =>
        isRecorded(row) && !row.reversed && !row.isReversal ? (
          <button
            type="button"
            onClick={() => onUndo(row)}
            style={{
              ...textStyle("callout"),
              background: "none",
              border: "none",
              color: colors.accent,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Undo
          </button>
        ) : null,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <StatRow>
        <StatTile label="Purchased" value={`${purchased} ${item.unit}`} hint="From received deliveries" />
        <StatTile label="Sold" value={`${sold} ${item.unit}`} hint="No sales capability yet" />
        <StatTile label="Removed, no sale" value={`${removed} ${item.unit}`} hint={`${added} ${item.unit} added back`} />
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
