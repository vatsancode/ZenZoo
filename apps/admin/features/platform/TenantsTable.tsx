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
import { useEffect, useState } from "react";
import CreateTenantSheet from "./CreateTenantSheet";
import TenantDetailSheet from "./TenantDetailSheet";
import { listTenants, type Tenant } from "./tenants";

export default function TenantsTable() {
  const { colors, spacing } = useTheme();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  function refresh() {
    listTenants(query)
      .then((next) => {
        setTenants(next);
        setError(null);
      })
      .catch(() => setError("Couldn't load tenants."));
  }

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(refresh, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const pageCount = Math.max(1, Math.ceil((tenants?.length ?? 0) / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = (tenants ?? []).slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const muted = (value: string) => (
    <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{value}</span>
  );

  const columns: TableColumn<Tenant>[] = [
    { key: "name", header: "Tenant", width: "32%", render: (tenant) => tenant.name },
    { key: "slug", header: "Slug", render: (tenant) => muted(tenant.slug) },
    {
      key: "status",
      header: "Status",
      render: (tenant) => (
        <Badge tone={tenant.status === "active" ? "success" : "neutral"}>{tenant.status}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (tenant) => muted(new Date(tenant.createdAt).toLocaleDateString()),
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
            placeholder="Search by name or slug..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            aria-label="Search tenants"
          />
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          Create tenant
        </Button>
      </div>

      {error ? (
        message(error)
      ) : tenants === null ? (
        message("Loading tenants...")
      ) : tenants.length === 0 ? (
        message("No tenants match your search.")
      ) : (
        <>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(tenant) => tenant.id}
            onRowClick={(tenant) => setSelected(tenant)}
          />
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            total={tenants.length}
            onPageChange={setPage}
            pageSizeOptions={[10, 25, 50]}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <TenantDetailSheet tenant={selected} onClose={() => setSelected(null)} />
      <CreateTenantSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />
    </div>
  );
}
