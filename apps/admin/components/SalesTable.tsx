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
  PAYMENT_ACCOUNT_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
  STORE_CREDIT,
} from "../lib/payment-options";
import {
  listSales,
  SALE_STATUS_LABEL,
  saleDiscountTotal,
  saleProfitOf,
  saleRefundTotal,
  saleStatus,
  type Sale,
} from "../lib/sales";
import { formatDate, formatPrice } from "../lib/stock-display";
import FilterPills, { type FilterGroup } from "./FilterPills";
import SalesFilterSheet, { NO_FILTERS, type SalesFilters } from "./SalesFilterSheet";
import StatTile, { StatRow } from "./StatTile";

const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

/** Every sale that has been made: totals up top, then a searchable, filterable list. */
export default function SalesTable() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SalesFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    listSales().then(setSales);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sales ?? []).filter((sale) => {
      // A sale that spent any store credit counts under "Store credit", even if money paid the rest.
      if (
        filters.methods.length > 0 &&
        !filters.methods.includes(sale.payment.method) &&
        !(filters.methods.includes(STORE_CREDIT) && (sale.creditUsed ?? 0) > 0)
      )
        return false;
      if (filters.accounts.length > 0 && !filters.accounts.includes(sale.payment.accountId))
        return false;
      if (filters.from !== "" && sale.date < filters.from) return false;
      if (filters.to !== "" && sale.date > filters.to) return false;
      if (!q) return true;
      return (
        sale.number.toLowerCase().includes(q) ||
        sale.customerName.toLowerCase().includes(q) ||
        sale.lines.some(
          (line) => line.name.toLowerCase().includes(q) || line.sku.toLowerCase().includes(q),
        )
      );
    });
  }, [sales, query, filters]);

  // The figures follow the filter, so "UPI only" shows what UPI brought in.
  const revenue = filtered.reduce((sum, sale) => sum + sale.total - saleRefundTotal(sale), 0);
  const refunds = filtered.reduce((sum, sale) => sum + saleRefundTotal(sale), 0);
  const discounts = filtered.reduce((sum, sale) => sum + saleDiscountTotal(sale), 0);
  const profit = filtered.reduce((sum, sale) => sum + saleProfitOf(sale).profit, 0);
  const units = filtered.reduce(
    (sum, sale) => sum + sale.lines.reduce((inner, line) => inner + line.quantity, 0),
    0,
  );

  const rangeLabel =
    filters.from && filters.to
      ? filters.from === filters.to
        ? formatDate(filters.from)
        : `${formatDate(filters.from)} - ${formatDate(filters.to)}`
      : filters.from
        ? `From ${formatDate(filters.from)}`
        : filters.to
          ? `Until ${formatDate(filters.to)}`
          : "";
  // One removable pill per active choice: the date range, each method, each account.
  // One pill per filter, however many values it holds.
  const groups: FilterGroup[] = [
    ...(rangeLabel
      ? [
          {
            key: "range",
            label: "Date",
            values: [rangeLabel],
            onClear: () => setFilters({ ...filters, from: "", to: "" }),
          },
        ]
      : []),
    ...(filters.methods.length > 0
      ? [
          {
            key: "methods",
            label: "Payment",
            values: filters.methods.map((code) => paymentMethodLabel(code)),
            onClear: () => setFilters({ ...filters, methods: [] }),
          },
        ]
      : []),
    ...(filters.accounts.length > 0
      ? [
          {
            key: "accounts",
            label: "Received into",
            values: filters.accounts.map((id) => labelOf(PAYMENT_ACCOUNT_OPTIONS, id)),
            onClear: () => setFilters({ ...filters, accounts: [] }),
          },
        ]
      : []),
  ];
  const activeCount = groups.length;

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const muted = (value: string) => (
    <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{value}</span>
  );

  const columns: TableColumn<Sale>[] = [
    { key: "number", header: "Invoice", width: "11%", render: (sale) => muted(sale.number) },
    { key: "date", header: "Date", render: (sale) => formatDate(sale.date) },
    {
      key: "customer",
      header: "Customer",
      width: "20%",
      render: (sale) =>
        sale.customerId ? (
          sale.customerName
        ) : (
          <span style={{ color: colors.inkMuted }}>{sale.customerName}</span>
        ),
    },
    {
      key: "items",
      header: "Items",
      render: (sale) => {
        const count = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
        return `${count} ${count === 1 ? "item" : "items"}`;
      },
    },
    {
      key: "payment",
      header: "Payment",
      render: (sale) => (
        <span>
          {paymentMethodLabel(sale.payment.method)}
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
            {sale.payment.method === STORE_CREDIT
              ? "No money taken"
              : labelOf(PAYMENT_ACCOUNT_OPTIONS, sale.payment.accountId)}
            {sale.creditUsed ? ` · ${formatPrice(sale.creditUsed)} credit` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (sale) => {
        const status = saleStatus(sale);
        return (
          <Badge tone={status === "completed" ? "success" : "warning"}>
            {SALE_STATUS_LABEL[status]}
          </Badge>
        );
      },
    },
    {
      key: "discount",
      header: "Discount",
      align: "right",
      render: (sale) => {
        const off = saleDiscountTotal(sale);
        return off > 0 ? (
          <span style={{ ...textStyle("data"), color: colors.warning }}>- {formatPrice(off)}</span>
        ) : (
          muted("-")
        );
      },
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (sale) => <span style={textStyle("data")}>{formatPrice(sale.total)}</span>,
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      render: (sale) => {
        const result = saleProfitOf(sale);
        return result.known ? (
          <span
            style={{
              ...textStyle("data"),
              color: result.profit < 0 ? colors.danger : colors.success,
            }}
          >
            {formatPrice(result.profit)}
          </span>
        ) : (
          muted("-")
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing[3],
          }}
        >
          <div style={{ maxWidth: 360, width: "100%" }}>
            <Input
              type="search"
              placeholder="Search invoice, customer, item..."
              aria-label="Search sales"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFiltersOpen(true)}
            style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
          >
            Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </Button>
        </div>

        <FilterPills
          groups={groups}
          onEdit={() => setFiltersOpen(true)}
          onClearAll={() => {
            setFilters(NO_FILTERS);
            setPage(1);
          }}
        />
      </div>

      <StatRow>
        <StatTile
          label="Sales"
          value={String(filtered.length)}
          hint={`${units} ${units === 1 ? "unit" : "units"} sold`}
        />
        <StatTile
          label="Revenue"
          value={formatPrice(revenue)}
          hint={refunds > 0 ? `After ${formatPrice(refunds)} refunded` : "Taken after discounts"}
        />
        <StatTile
          label="Discounts given"
          value={formatPrice(discounts)}
          hint="On items and bills"
        />
        <StatTile label="Profit" value={formatPrice(profit)} hint="Revenue less cost of goods" />
      </StatRow>

      {sales === null ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Loading sales...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          {sales.length === 0
            ? "No sales yet. Sales made at the Point of Sale appear here."
            : "No sales match your search."}
        </div>
      ) : (
        <div>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(sale) => sale.id}
            onRowClick={(sale) => router.push(`/sales/${encodeURIComponent(sale.id)}`)}
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
      <SalesFilterSheet
        open={filtersOpen}
        filters={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setPage(1);
          setFiltersOpen(false);
        }}
      />
    </div>
  );
}
