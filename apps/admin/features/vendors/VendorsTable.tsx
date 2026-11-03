"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  IconButton,
  Input,
  LoadError,
  Notice,
  Pagination,
  SkeletonTable,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccess } from "../../lib/access";
import { addVendor, editVendor, listVendors, type Vendor, type VendorInput } from "./vendors";
import VendorSheet from "./VendorSheet";
import { useSingleFlight } from "../../lib/useSingleFlight";

export default function VendorsTable() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { can, isReady } = useAccess();
  const canEdit = can("vendors", "edit");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set when fetching the list failed: before anything loaded, or after a save went through.
  const [loadProblem, setLoadProblem] = useState<"load" | "refresh" | null>(null);
  const { busy: reloading, run: runReload } = useSingleFlight();

  /** Fetches the list; `problem` says what to tell the person if that fails. */
  const reload = useCallback(
    (problem: "load" | "refresh") =>
      runReload(async () => {
        try {
          setVendors(await listVendors());
          setLoadProblem(null);
        } catch {
          setLoadProblem(problem);
        }
      }),
    [runReload],
  );

  useEffect(() => {
    void reload("load");
  }, [reload]);

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
  async function handleSubmit(input: VendorInput): Promise<string | null> {
    const result = editing ? await editVendor(editing.id, input) : await addVendor(input);
    // Refused: the sheet stays open and shows why.
    if (typeof result === "string") return result;

    // Saved. Show it straight away, so a failed refresh below can't hide that it went through
    // (and tempt a second save of the same vendor).
    setVendors((current) =>
      editing
        ? (current ?? []).map((vendor) => (vendor.id === result.id ? result : vendor))
        : [result, ...(current ?? [])],
    );
    // A new vendor lands at the top of the list, so go there to show it.
    if (!editing) setPage(1);
    setNotice(editing ? `${result.name} updated.` : `${result.name} added.`);
    closeSheet();
    // Then catch up with anything else that changed - separately, with its own Try again.
    void reload("refresh");
    return null;
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
        {canEdit ? (
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            Add vendor
          </Button>
        ) : null}
      </div>

      {notice ? <Notice style={{ marginBottom: spacing[4] }}>{notice}</Notice> : null}

      {loadProblem === "refresh" ? (
        <LoadError
          message="Saved, but couldn't refresh the list."
          onRetry={() => void reload("refresh")}
          retrying={reloading}
          style={{ marginBottom: spacing[4] }}
        />
      ) : null}

      {vendors === null && loadProblem === "load" ? (
        <LoadError
          message="Couldn't load the vendors."
          onRetry={() => void reload("load")}
          retrying={reloading}
        />
      ) : vendors === null || !isReady ? (
        // Same columns as the real table, so the headers are already in place.
        <SkeletonTable
          columns={canEdit ? columns : columns.filter((column) => column.key !== "actions")}
          rows={5}
        />
      ) : filtered.length === 0 ? (
        message("No vendors match your search.")
      ) : (
        <>
          <Table
            columns={canEdit ? columns : columns.filter((column) => column.key !== "actions")}
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
        existing={vendors ?? []}
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
