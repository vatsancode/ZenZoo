"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { IconButton, Table, textStyle, type TableColumn } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { printBarcodeLabel } from "../lib/barcode";
import { formatPrice } from "../lib/stock-display";
import { formatDate, type Batch, type StockItem } from "../lib/stock-history";
import StatTile, { StatRow } from "./StatTile";

/**
 * `title` is what goes on a printed label (the product, plus the variant if it
 * has one).
 */
export default function CurrentBatchesTab({
  item,
  title,
  batches,
}: {
  item: StockItem;
  title: string;
  /** Batches that still have stock. */
  batches: Batch[];
}) {
  const { colors, spacing } = useTheme();
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyBarcode(batch: Batch) {
    try {
      await navigator.clipboard.writeText(batch.barcode);
      setCopied(batch.id);
    } catch {
      // Clipboard can be blocked (e.g. an insecure page); the number is still selectable.
    }
  }


  const columns: TableColumn<Batch>[] = [
    {
      key: "batchNo",
      header: "Batch",
      render: (batch) => <span style={textStyle("dataSmall")}>{batch.batchNo}</span>,
    },
    {
      key: "barcode",
      header: "Barcode",
      width: "30%",
      render: (batch) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: spacing[2] }}>
          <span style={{ ...textStyle("dataSmall"), color: colors.ink, userSelect: "all" }}>
            {batch.barcode}
          </span>
          <span style={{ display: "inline-flex" }}>
            <IconButton
              icon={copied === batch.id ? "check" : "copy"}
              tone={copied === batch.id ? "success" : "default"}
              label={copied === batch.id ? "Copied" : "Copy barcode"}
              onClick={() => copyBarcode(batch)}
            />
            <IconButton
              icon="print"
              label="Print barcode label"
              onClick={() =>
                printBarcodeLabel({
                  title,
                  barcode: batch.barcode,
                  batchNo: batch.batchNo,
                  price: formatPrice(item.price),
                })
              }
            />
          </span>
        </span>
      ),
    },
    { key: "receivedOn", header: "Received", render: (batch) => formatDate(batch.receivedOn) },
    {
      key: "remaining",
      header: "In stock",
      render: (batch) => (
        <span style={textStyle("data")}>
          {batch.remaining} {item.unit}
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            {" "}
            of {batch.received}
          </span>
        </span>
      ),
    },
    {
      key: "unitCost",
      header: "Cost per unit",
      render: (batch) => <span style={textStyle("data")}>{formatPrice(batch.unitCost)}</span>,
    },
    {
      key: "value",
      header: "Value at cost",
      render: (batch) => (
        <span style={textStyle("data")}>{formatPrice(batch.remaining * batch.unitCost)}</span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <StatRow>
        <StatTile
          label="Batches on hand"
          value={batches.length}
          hint="Batches that still have stock"
        />
        <StatTile label="Total in stock" value={`${item.quantity} ${item.unit}`} />
      </StatRow>
      {batches.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          There is no stock on hand, so there are no batches to show.
        </div>
      ) : (
        <Table columns={columns} rows={batches} getRowKey={(batch) => batch.id} />
      )}
    </div>
  );
}
