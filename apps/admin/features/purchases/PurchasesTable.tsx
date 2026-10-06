"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Input,
  Pagination,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  listPurchases,
  PURCHASE_STATUS_LABEL,
  PURCHASE_STATUS_TONE,
  type Purchase,
} from "./purchases";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { listVendors, type Vendor } from "../vendors/vendors";

export default function PurchasesTable() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    listPurchases().then(setPurchases);
    listVendors().then(setVendors);
  }, []);

  const vendorName = useMemo(() => {
    const names = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
    return (id: string) => names.get(id) ?? "Unknown vendor";
  }, [vendors]);

  const filtered = useMemo(() => {
    if (!purchases) return [];
    const q = query.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(
      (purchase) =>
        (purchase.reference ?? "").toLowerCase().includes(q) ||
        vendorName(purchase.vendorId).toLowerCase().includes(q) ||
        purchase.status.includes(q),
    );
  }, [purchases, query, vendorName]);

  // Stay on a real page even if the list shrinks (e.g. after typing in the search box).
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const columns: TableColumn<Purchase>[] = [
    {
      key: "reference",
      header: "Invoice",
      render: (purchase) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
          {purchase.reference ?? "-"}
        </span>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      width: "28%",
      render: (purchase) => vendorName(purchase.vendorId),
    },
    { key: "date", header: "Date", render: (purchase) => formatDate(purchase.date) },
    {
      key: "status",
      header: "Status",
      render: (purchase) => (
        <Badge tone={PURCHASE_STATUS_TONE[purchase.status]}>
          {PURCHASE_STATUS_LABEL[purchase.status]}
        </Badge>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (purchase) => <span style={textStyle("data")}>{formatPrice(purchase.total)}</span>,
    },
  ];

  const message = (text: string) => (
    <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
      {text}
    </div>
  );

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
            placeholder="Search invoice, vendor, status..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            aria-label="Search purchases"
          />
        </div>
        <Button variant="primary" onClick={() => router.push("/purchases/new")}>
          Add purchase
        </Button>
      </div>

      {purchases === null ? (
        message("Loading purchases...")
      ) : filtered.length === 0 ? (
        message("No purchases match your search.")
      ) : (
        <>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(purchase) => purchase.id}
            onRowClick={(purchase) => router.push(`/purchases/${encodeURIComponent(purchase.id)}`)}
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
    </div>
  );
}
