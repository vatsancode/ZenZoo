"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  IconButton,
  Input,
  Notice,
  Pagination,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  addVendor,
  editVendor,
  listVendors,
  saveVendors,
  type Vendor,
  type VendorInput,
} from "../lib/vendors";
import VendorSheet from "./VendorSheet";

export default function VendorsTable() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listVendors().then(setVendors);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function closeSheet() {
    setAddOpen(false);
    setEditing(null);
  }

  // One sheet serves both: adding a new vendor, or editing the clicked row.
  function handleSubmit(input: VendorInput) {
    if (!vendors) return;
    const next = editing ? editVendor(vendors, editing.id, input) : addVendor(vendors, input);
    setVendors(next);
    saveVendors(next);
    // A new vendor lands at the top of the list, so go there to show it.
    if (!editing) setPage(1);
    setNotice(editing ? `${input.name.trim()} updated.` : `${input.name.trim()} added.`);
    closeSheet();
  }

  const filtered = useMemo(() => {
    if (!vendors) return [];
    const q = query.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(
      (vendor) =>
        vendor.name.toLowerCase().includes(q) ||
        (vendor.phone ?? "").toLowerCase().includes(q) ||
        (vendor.email ?? "").toLowerCase().includes(q) ||
        (vendor.taxId ?? "").toLowerCase().includes(q),
    );
  }, [vendors, query]);

  // Stay on a real page even if the list shrinks (e.g. after typing in the search box).
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const muted = (value?: string) => (
    <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{value ?? "-"}</span>
  );

  const columns: TableColumn<Vendor>[] = [
    { key: "name", header: "Vendor", width: "24%", render: (vendor) => vendor.name },
    { key: "phone", header: "Phone", render: (vendor) => muted(vendor.phone) },
    { key: "email", header: "Email", render: (vendor) => muted(vendor.email) },
    {
      key: "status",
      header: "Status",
      render: (vendor) => (
        <Badge tone={vendor.status === "active" ? "success" : "neutral"}>
          {vendor.status === "active" ? "Active" : "Archived"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      width: "88px",
      render: (vendor) => (
        <IconButton
          icon="edit"
          label={`Edit ${vendor.name}`}
          onClick={(event) => {
            event.stopPropagation();
            setEditing(vendor);
          }}
        />
      ),
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
            placeholder="Search name, phone, email, GSTIN..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            aria-label="Search vendors"
          />
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          Add vendor
        </Button>
      </div>

      {notice ? <Notice style={{ marginBottom: spacing[4] }}>{notice}</Notice> : null}

      {vendors === null ? (
        message("Loading vendors...")
      ) : filtered.length === 0 ? (
        message("No vendors match your search.")
      ) : (
        <>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(vendor) => vendor.id}
            onRowClick={(vendor) => router.push(`/vendors/${encodeURIComponent(vendor.id)}`)}
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

      <VendorSheet
        open={addOpen || editing !== null}
        vendor={editing}
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
