"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Button,
  Input,
  Notice,
  Pagination,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { creditBalance, creditEntries, customerSales, netSpent } from "../lib/customer-insights";
import {
  addCustomer,
  dueBalance,
  dueEntries,
  listCollections,
  listCustomers,
  listSales,
  type Customer,
  type DueCollection,
  type Sale,
} from "../lib/sales";
import { formatDate, formatPrice } from "../lib/stock-display";
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
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [collections, setCollections] = useState<DueCollection[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listCustomers().then(setCustomers);
    listSales().then(setSales);
    listCollections().then(setCollections);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const rows: Row[] = useMemo(
    () =>
      (customers ?? []).map((customer) => {
        const mine = customerSales(sales, customer.id);
        return {
          customer,
          purchases: mine.length,
          spent: netSpent(mine),
          lastPurchase: mine[0]?.date,
          credit: creditBalance(creditEntries(mine)),
          owes: dueBalance(
            dueEntries(
              mine,
              collections.filter((item) => item.customerId === customer.id),
            ),
          ),
        };
      }),
    [customers, sales, collections],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ customer }) =>
        customer.name.toLowerCase().includes(q) ||
        (customer.phone ?? "").toLowerCase().includes(q) ||
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
            placeholder="Search name, phone, email..."
            aria-label="Search customers"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>
          Add customer
        </Button>
      </div>

      {notice ? <Notice style={{ marginBottom: spacing[4] }}>{notice}</Notice> : null}

      {customers === null ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Loading customers...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          No customers match your search.
        </div>
      ) : (
        <>
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
        </>
      )}

      <CustomerSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={(input) => {
          const customer = addCustomer(input.name, { phone: input.phone, email: input.email });
          setCustomers((current) => [customer, ...(current ?? [])]);
          setPage(1);
          setAddOpen(false);
          setNotice(`${customer.name} added.`);
        }}
      />
    </div>
  );
}
