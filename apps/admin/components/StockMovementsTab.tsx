"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Chips, Table, textStyle, type BadgeTone, type TableColumn } from "@zenzoo/ui-web";
import { useMemo, useState } from "react";
import { formatPrice } from "../lib/stock-display";
import {
  consumptionHistory,
  formatDate,
  type Movement,
  type MovementType,
  type RecordedMovement,
  type StockItem,
} from "../lib/stock-history";
import StatTile, { StatRow } from "./StatTile";

const TONES: Record<MovementType, BadgeTone> = {
  Sale: "neutral",
  Return: "success",
  Removed: "warning",
  Added: "success",
  Counted: "neutral",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "sales", label: "Sales and returns" },
  { value: "removed", label: "Removed" },
  { value: "added", label: "Added" },
  { value: "counted", label: "Counts" },
];

const FILTER_TYPES: Record<string, MovementType[]> = {
  sales: ["Sale", "Return"],
  removed: ["Removed"],
  added: ["Added"],
  counted: ["Counted"],
};

// The sample history covers roughly the last month.
const PERIOD_DAYS = 30;

function signed(quantity: number, unit: string): string {
  return `${quantity > 0 ? "+" : "−"}${Math.abs(quantity)} ${unit}`;
}

function isRecorded(row: Movement): row is RecordedMovement {
  return "batchId" in row;
}

export default function StockMovementsTab({
  item,
  recorded,
  onUndo,
}: {
  item: StockItem;
  /** Movements recorded this session; shown above the sample history. */
  recorded: RecordedMovement[];
  onUndo: (movement: RecordedMovement) => void;
}) {
  const { colors, spacing } = useTheme();
  const [filter, setFilter] = useState("all");
  const movements = useMemo(() => [...recorded, ...consumptionHistory(item)], [item, recorded]);

  // Net units sold: sales minus anything customers brought back. Entries that
  // were undone, and the undo entries themselves, cancel out and aren't counted.
  const counted = movements.filter((row) => !(isRecorded(row) && (row.reversed || row.isReversal)));
  const sold = counted
    .filter((row) => row.type === "Sale" || row.type === "Return")
    .reduce((sum, row) => sum - row.quantity, 0);
  // Stock that left (or came back) outside of a sale or a customer return.
  const removed = counted
    .filter((row) => row.type === "Removed")
    .reduce((sum, row) => sum - row.quantity, 0);
  const added = counted
    .filter((row) => row.type === "Added")
    .reduce((sum, row) => sum + row.quantity, 0);
  const soldValue = sold * item.price;
  const perWeek = Math.round((sold / PERIOD_DAYS) * 7 * 10) / 10;
  const daysLeft = sold > 0 ? Math.floor(item.quantity / (sold / PERIOD_DAYS)) : null;

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
      render: (row) =>
        row.type === "Sale" || row.type === "Return" ? (
          <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{row.reference}</span>
        ) : (
          <span style={{ color: colors.inkMuted }}>{row.reference}</span>
        ),
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
        <StatTile
          label="Sold"
          value={`${sold} ${item.unit}`}
          hint={`${formatPrice(soldValue)} after returns`}
        />
        <StatTile label="Average per week" value={`${perWeek} ${item.unit}`} />
        <StatTile
          label="Stock will last"
          value={daysLeft === null ? "-" : `${daysLeft} days`}
          hint={daysLeft === null ? "Not selling yet" : "At the recent pace"}
        />
        <StatTile
          label="Removed, no sale"
          value={`${removed} ${item.unit}`}
          hint={`${added} ${item.unit} added back`}
        />
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
