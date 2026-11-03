"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Button,
  Input,
  LoadError,
  Notice,
  Pagination,
  SkeletonTable,
  Table,
  Tabs,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccess } from "../../lib/access";
import { useSingleFlight } from "../../lib/useSingleFlight";
import { addCustomer, creditOf, listCustomers, owesOf, type Customer } from "../../lib/customers";
import { formatDate, formatPrice } from "../../lib/stock-display";
import CustomerSheet from "./CustomerSheet";

interface Row {
  customer: Customer;
  purchases: number;
  spent: number;
  lastPurchase?: string;
  credit: number;
  owes: number;
}

/** Everyone who has bought from you, with what they have spent and any store credit they hold. */
export default function CustomersTable() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  // Active and archived together - the tab only filters, so switching is instant.
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const canEdit = useAccess().can("customers", "edit");
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { busy: loading, run: runLoad } = useSingleFlight();

  const load = useCallback(
    () =>
      runLoad(async () => {
        setLoadFailed(false);
        try {
          setCustomers(await listCustomers(true));
        } catch {
          // Not an empty list - say it failed, so nobody reads it as "no customers yet".
          setLoadFailed(true);
        }
      }),
    [runLoad],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const rows: Row[] = useMemo(
    () =>
      (customers ?? [])
        .filter((customer) => customer.status === status)
        .map((customer) => {
          return {
            customer,
            purchases: customer.purchases,
            spent: Number(customer.spent),
            lastPurchase: customer.lastPurchase ?? undefined,
            // From the server's ledger total, so it always agrees with the till.
            credit: creditOf(customer),
            owes: owesOf(customer),
          };
        }),
    [customers, status],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ customer }) =>
        customer.name.toLowerCase().includes(q) ||
        (customer.phone ?? "").includes(q.replace(/[\s-]/g, "")) ||
        (customer.email ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const muted = (value: string) => (
    <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{value}</span>
  );

  const columns: TableColumn<Row>[] = [
    {
      key: "name",
      header: "Customer",
      width: "26%",
      render: ({ customer }) => (
        <span>
          {customer.name}
          {customer.email ? (
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
              {customer.email}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "phone", header: "Phone", render: ({ customer }) => muted(customer.phone ?? "-") },
    {
      key: "purchases",
      header: "Purchases",
      render: ({ purchases }) => <span style={textStyle("data")}>{purchases}</span>,
    },
    {
      key: "last",
      header: "Last purchase",
      render: ({ lastPurchase }) => (lastPurchase ? formatDate(lastPurchase) : muted("-")),
    },
    {
      key: "spent",
      header: "Total spent",
      align: "right",
      render: ({ spent }) => <span style={textStyle("data")}>{formatPrice(spent)}</span>,
    },
    {
      key: "credit",
      header: "Store credit",
      align: "right",
      render: ({ credit }) =>
        credit > 0 ? (
          <span style={{ ...textStyle("data"), color: colors.success }}>{formatPrice(credit)}</span>
        ) : (
          muted("-")
        ),
    },
    {
      key: "owes",
      header: "Owes you",
      align: "right",
      render: ({ owes }) =>
        owes > 0 ? (
          <span style={{ ...textStyle("data"), color: colors.warning }}>{formatPrice(owes)}</span>
        ) : (
          muted("-")
        ),
    },
  ];

  const count = (which: "active" | "archived") =>
    (customers ?? []).filter((customer) => customer.status === which).length;

  return (
    <div>
      <div style={{ marginBottom: spacing[6] }}>
        <Tabs
          aria-label="Customer status"
          tabs={[
            { id: "active", label: `Active (${count("active")})` },
            { id: "archived", label: `Archived (${count("archived")})` },
          ]}
          value={status}
          onChange={(next) => {
            setStatus(next as "active" | "archived");
            setPage(1);
          }}
        />
      </div>
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
            placeholder="Search name, phone, email..."
            aria-label="Search customers"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        {canEdit ? (
          <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>
            Add customer
          </Button>
        ) : null}
      </div>

      {notice ? <Notice style={{ marginBottom: spacing[4] }}>{notice}</Notice> : null}

      {customers === null && loadFailed ? (
        <LoadError
          message="Couldn't load the customers."
          onRetry={() => void load()}
          retrying={loading}
        />
      ) : customers === null ? (
        <SkeletonTable columns={columns} rows={5} />
      ) : filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          {query.trim()
            ? "No customers match your search."
            : status === "archived"
              ? "No archived customers."
              : "No customers yet. Add one here, or at the till when they buy."}
        </div>
      ) : (
        <div role="tabpanel" aria-labelledby={`tab-${status}`}>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={({ customer }) => customer.id}
            onRowClick={({ customer }) =>
              router.push(`/customers/${encodeURIComponent(customer.id)}`)
            }
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
        </div>
      )}

      <CustomerSheet
        open={addOpen}
        existing={customers ?? []}
        onClose={() => setAddOpen(false)}
        onOpenCustomer={(id) => router.push(`/customers/${encodeURIComponent(id)}`)}
        onSubmit={async (input) => {
          const result = await addCustomer(input);
          if (typeof result === "string") return result;
          setCustomers((current) =>
            [...(current ?? []), result].sort((a, b) => a.name.localeCompare(b.name)),
          );
          setStatus("active");
          setPage(1);
          setAddOpen(false);
          setNotice(`${result.name} added.`);
          return null;
        }}
      />
    </div>
  );
}
