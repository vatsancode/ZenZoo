"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Button,
  Card,
  Notice,
  Pagination,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import StatTile, { StatRow } from "../../components/StatTile";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { listTillPaymentOptions, type TillPaymentOptions } from "../../lib/till";
import { listExpenseCategories } from "../expenses/expenseCategories";
import {
  salarySummary,
  type Employee,
  type SalaryPayment,
  type SalaryPaymentInput,
} from "./employees";
import SalaryPaymentSheet from "./SalaryPaymentSheet";

interface SalaryTabProps {
  employee: Employee;
  /** Newest first. */
  payments: SalaryPayment[];
  /** Saves a payment; resolves to an error message, or null once saved. */
  onRecord: (input: SalaryPaymentInput) => Promise<string | null>;
}

/** What has been paid to one employee, and a way to record the next payment. */
export default function SalaryTab({ employee, payments, onRecord }: SalaryTabProps) {
  const { colors, spacing } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [options, setOptions] = useState<TillPaymentOptions | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // The shop's own accounts, methods and expense categories - the same ones expenses use.
  useEffect(() => {
    Promise.all([listTillPaymentOptions(), listExpenseCategories()])
      .then(([paymentOptions, expenseCategories]) => {
        setOptions(paymentOptions);
        setCategories(expenseCategories);
        setOptionsFailed(false);
      })
      .catch(() => setOptionsFailed(true));
  }, []);

  const summary = useMemo(() => salarySummary(payments), [payments]);
  const pageCount = Math.max(1, Math.ceil(payments.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = payments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const muted = (value?: string) => (
    <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{value || "-"}</span>
  );

  const columns: TableColumn<SalaryPayment>[] = [
    { key: "date", header: "Paid on", width: "16%", render: (row) => formatDate(row.paidOn) },
    {
      key: "amount",
      header: "Amount",
      render: (row) => <span style={textStyle("data")}>{formatPrice(row.amount)}</span>,
    },
    { key: "account", header: "Paid from", render: (row) => muted(row.account) },
    { key: "method", header: "Method", render: (row) => muted(row.method) },
    { key: "category", header: "Category", render: (row) => muted(row.category) },
    { key: "note", header: "Note", width: "22%", render: (row) => muted(row.note) },
  ];

  return (
    <>
      <StatRow>
        <StatTile
          label="Paid this month"
          value={formatPrice(summary.thisMonth)}
          hint={summary.thisMonth > 0 ? undefined : "Nothing paid yet this month"}
        />
        <StatTile label="Paid this year" value={formatPrice(summary.thisYear)} />
        <StatTile label="Paid in total" value={formatPrice(summary.total)} />
        <StatTile
          label="Last payment"
          value={summary.latest ? formatPrice(summary.latest.amount) : "-"}
          hint={summary.latest ? formatDate(summary.latest.paidOn) : "No payments yet"}
        />
      </StatRow>

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing[4],
            marginBottom: spacing[5],
          }}
        >
          <div>
            <div style={{ ...textStyle("headline"), color: colors.ink }}>Salary payments</div>
            <div
              style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}
            >
              Every payment is filed as an expense.
            </div>
          </div>
          <Button type="button" variant="primary" onClick={() => setSheetOpen(true)}>
            Record payment
          </Button>
        </div>

        {payments.length === 0 ? (
          <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
            No salary has been paid to {employee.name} yet.
          </div>
        ) : (
          <>
            <Table columns={columns} rows={visible} getRowKey={(row) => row.id} />
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={payments.length}
              onPageChange={setPage}
              pageSizeOptions={[10, 25, 50]}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </Card>

      {optionsFailed && !sheetOpen ? (
        <Notice>
          Couldn&apos;t load your accounts and expense categories, so a payment can&apos;t be
          recorded right now. Reload the page to try again.
        </Notice>
      ) : null}

      <SalaryPaymentSheet
        open={sheetOpen}
        employeeName={employee.name}
        options={options}
        categories={categories}
        optionsFailed={optionsFailed}
        onClose={() => setSheetOpen(false)}
        onSubmit={async (input) => {
          const problem = await onRecord(input);
          if (!problem) setSheetOpen(false);
          return problem;
        }}
      />
    </>
  );
}
