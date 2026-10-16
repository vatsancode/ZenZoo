"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Chips,
  DatePicker,
  IconButton,
  Input,
  Modal,
  Notice,
  Pagination,
  Select,
  Sheet,
  Table,
  Tabs,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { accountLabel, rememberPaymentNames } from "../../lib/payment-options";
import { listAccounts, type Account } from "../settings/accounts";
import { addVendor, listVendors, type Vendor } from "../vendors/vendors";
import {
  addExpense,
  categoriesOf,
  deleteExpense,
  editExpense,
  isOverdue,
  listExpenses,
  payExpense,
  type Expense,
  type ExpenseInput,
} from "./expenses";
import { listExpenseCategories, resolveExpenseCategories } from "./expenseCategories";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { datePresets, isoDate } from "../../lib/date-ranges";
import ExpenseFilterSheet, { NO_EXPENSE_FILTERS, type ExpenseFilters } from "./ExpenseFilterSheet";
import FilterPills, { type FilterGroup } from "../../components/FilterPills";
import FormField from "../../components/FormField";
import StatTile, { StatRow } from "../../components/StatTile";

/** A line as typed: the amount stays a string until the bill is saved. */
interface LineRow {
  description: string;
  category: string;
  amount: string;
}

const blankLine = (): LineRow => ({ description: "", category: "", amount: "" });

const accountName = (id: string | undefined) => (id ? accountLabel(id) : "-");

type StatusTab = "all" | "pending" | "paid";

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "To pay" },
  { id: "paid", label: "Paid" },
];

// Columns of a line in the form: description, category, amount, remove.
const LINE_COLUMNS = "minmax(0, 1.3fr) minmax(0, 1fr) 110px 32px";

/** The bills the shop owes or has paid, each with the items it covered and their categories. */
export default function ExpensesTable() {
  const { colors, radius, spacing } = useTheme();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tab, setTab] = useState<StatusTab>("all");
  const [query, setQuery] = useState("");
  // Starts on this month; Filters changes it.
  const [filters, setFilters] = useState<ExpenseFilters>(() => {
    const month = datePresets().find((preset) => preset.id === "month");
    return { ...NO_EXPENSE_FILTERS, from: month?.from ?? "", to: month?.to ?? "" };
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // null = closed; an Expense = editing it; "new" = adding.
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  // The bill being marked paid, and what it is being paid with.
  const [paying, setPaying] = useState<Expense | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The form's fields.
  const [date, setDate] = useState("");
  const [payee, setPayee] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<"paid" | "pending">("paid");
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);
  const [touched, setTouched] = useState(false);

  async function reload() {
    setExpenses([...(await listExpenses())]);
    setCategories((await listExpenseCategories()).map((item) => item.name));
    setVendors([...(await listVendors())]);
    const real = await listAccounts();
    rememberPaymentNames([], real);
    setAccounts(real);
  }

  const accountOptions = accounts
    .filter((account) => account.status === "active")
    .map((account) => ({ value: account.id, label: account.name }));
  const today = isoDate(new Date());

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (expenses ?? [])
      .filter((expense) => {
        if (tab !== "all" && expense.status !== tab) return false;
        if (filters.from !== "" && expense.date < filters.from) return false;
        if (filters.to !== "" && expense.date > filters.to) return false;
        if (
          filters.accounts.length > 0 &&
          !(expense.accountId && filters.accounts.includes(expense.accountId))
        )
          return false;
        if (
          filters.categories.length > 0 &&
          !expense.lines.some((line) => filters.categories.includes(line.category))
        )
          return false;
        if (!q) return true;
        return (
          (expense.payee ?? "").toLowerCase().includes(q) ||
          (expense.reference ?? "").toLowerCase().includes(q) ||
          (expense.note ?? "").toLowerCase().includes(q) ||
          accountName(expense.accountId).toLowerCase().includes(q) ||
          expense.lines.some(
            (line) =>
              line.description.toLowerCase().includes(q) || line.category.toLowerCase().includes(q),
          )
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [expenses, query, filters, tab]);

  // Spending by category counts each line, so a mixed bill is split across its categories.
  const byCategory = new Map<string, number>();
  for (const expense of filtered) {
    for (const line of expense.lines) {
      if (filters.categories.length > 0 && !filters.categories.includes(line.category)) continue;
      byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + line.amount);
    }
  }
  const paidTotal = filtered
    .filter((expense) => expense.status === "paid")
    .reduce((sum, expense) => sum + expense.total, 0);
  const owed = filtered.filter((expense) => expense.status === "pending");
  const owedTotal = owed.reduce((sum, expense) => sum + expense.total, 0);
  const overdueCount = owed.filter((expense) => isOverdue(expense, today)).length;
  const biggest = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  const presetMatch = datePresets().find(
    (preset) => preset.from === filters.from && preset.to === filters.to,
  );
  const rangeLabel =
    filters.from === "" && filters.to === ""
      ? ""
      : presetMatch
        ? presetMatch.label
        : filters.from && filters.to
          ? filters.from === filters.to
            ? formatDate(filters.from)
            : `${formatDate(filters.from)} - ${formatDate(filters.to)}`
          : filters.from
            ? `From ${formatDate(filters.from)}`
            : `Until ${formatDate(filters.to)}`;
  // One removable pill per active choice: the date range, each category, each account.
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
    ...(filters.categories.length > 0
      ? [
          {
            key: "categories",
            label: "Category",
            values: filters.categories,
            onClear: () => setFilters({ ...filters, categories: [] }),
          },
        ]
      : []),
    ...(filters.accounts.length > 0
      ? [
          {
            key: "accounts",
            label: "Paid from",
            values: filters.accounts.map((id) => accountName(id)),
            onClear: () => setFilters({ ...filters, accounts: [] }),
          },
        ]
      : []),
  ];

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function openForm(target: Expense | "new") {
    setEditing(target);
    setDate(target === "new" ? isoDate(new Date()) : target.date);
    setPayee(target === "new" ? "" : (target.payee ?? ""));
    setReference(target === "new" ? "" : (target.reference ?? ""));
    setStatus(target === "new" ? "paid" : target.status);
    setDueDate(target === "new" ? "" : (target.dueDate ?? ""));
    setPaidDate(target === "new" ? isoDate(new Date()) : (target.paidDate ?? isoDate(new Date())));
    setAccountId(target === "new" ? "" : (target.accountId ?? ""));
    setNote(target === "new" ? "" : (target.note ?? ""));
    setLines(
      target === "new"
        ? [blankLine()]
        : target.lines.map((line) => ({
            description: line.description,
            category: line.category,
            amount: String(line.amount),
          })),
    );
    setTouched(false);
  }

  const lineAmount = (row: LineRow) => (row.amount.trim() === "" ? 0 : Number(row.amount));
  const formTotal =
    Math.round(lines.reduce((sum, row) => sum + (lineAmount(row) || 0), 0) * 100) / 100;
  const lineProblem = (row: LineRow) =>
    row.category.trim() === ""
      ? "Choose a category."
      : Number.isNaN(lineAmount(row)) || lineAmount(row) <= 0
        ? "Enter the amount."
        : null;
  const problems = {
    date: date === "" ? "Choose the date." : null,
    account:
      status === "paid" && accountId === "" ? "Choose the account it was paid from." : null,
    lines: lines.some((row) => lineProblem(row) !== null)
      ? "Every item needs a category and an amount."
      : null,
  };
  const valid = Object.values(problems).every((item) => item === null);

  async function submit() {
    setTouched(true);
    if (!valid || !editing || saving) return;
    setSaving(true);
    // Categories typed in on the fly are created for real before the bill is filed under them.
    const ids = await resolveExpenseCategories(lines.map((row) => row.category));
    if (typeof ids === "string") {
      setSaving(false);
      setNotice(ids);
      return;
    }
    const input: ExpenseInput = {
      date,
      payee,
      reference,
      note,
      status,
      dueDate: status === "pending" ? dueDate : "",
      accountId: status === "paid" ? accountId : "",
      paidDate: status === "paid" ? paidDate : "",
      lines: lines.map((row) => ({
        description: row.description,
        categoryId: ids.get(row.category.trim().toLowerCase()) ?? "",
        amount: lineAmount(row),
      })),
    };
    let message: string | null;
    if (editing === "new") {
      const result = await addExpense(input);
      message = typeof result === "string" ? result : null;
    } else {
      message = await editExpense(editing, input);
    }
    setSaving(false);
    if (message) {
      setNotice(message);
      return;
    }
    if (editing === "new") {
      setPage(1);
      setNotice(
        status === "pending"
          ? `Bill of ${formatPrice(formTotal)} added to pay later.`
          : `Expense of ${formatPrice(formTotal)} added.`,
      );
    } else {
      setNotice("Expense updated.");
    }
    setEditing(null);
    void reload();
  }

  function openPay(expense: Expense) {
    setPaying(expense);
    setPayAccountId("");
    setPayDate(today);
    setPayError(null);
  }

  async function confirmPay() {
    if (!paying) return;
    if (payAccountId === "") {
      setPayError("Choose the account it was paid from.");
      return;
    }
    if (payDate === "") {
      setPayError("Choose the date it was paid.");
      return;
    }
    const message = await payExpense(paying, payAccountId, payDate);
    if (message) {
      setPayError(message);
      return;
    }
    setNotice(`${formatPrice(paying.total)} marked as paid from ${accountName(payAccountId)}.`);
    setPaying(null);
    void reload();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const message = await deleteExpense(deleting);
    setDeleting(null);
    setNotice(message ?? "Expense deleted.");
    void reload();
  }

  // Picking a name that is not a vendor yet creates the vendor (name only; the rest can be
  // filled in on the Vendors page).
  async function pickPayee(name: string) {
    const typed = name.trim();
    if (typed === "" || vendors.some((vendor) => vendor.name === typed)) {
      setPayee(typed);
      return;
    }
    const result = await addVendor({ name: typed, phone: "", email: "", taxId: "", mapUrl: "" });
    if (typeof result === "string") {
      setNotice(result);
      return;
    }
    setVendors((current) => [...current, result]);
    setPayee(result.name);
    setNotice(`${result.name} added to your vendors.`);
  }

  function updateLine(index: number, patch: Partial<LineRow>) {
    setLines((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const columns: TableColumn<Expense>[] = [
    { key: "date", header: "Date", width: "12%", render: (expense) => formatDate(expense.date) },
    {
      key: "payee",
      header: "Paid to",
      width: "22%",
      render: (expense) =>
        expense.payee ? (
          <span>
            {expense.payee}
            {expense.reference ? (
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
                {expense.reference}
              </span>
            ) : null}
          </span>
        ) : (
          <span style={{ color: colors.inkFaint }}>-</span>
        ),
    },
    {
      key: "items",
      header: "Items",
      width: "26%",
      render: (expense) => (
        <span>
          {expense.lines[0]?.description || expense.lines[0]?.category}
          {expense.lines.length > 1 ? (
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
              + {expense.lines.length - 1} more {expense.lines.length === 2 ? "item" : "items"}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (expense) => {
        const names = categoriesOf(expense);
        return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (expense) => {
        if (expense.status === "paid") {
          return (
            <span>
              <Badge tone="success">Paid</Badge>
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
                {accountName(expense.accountId)}
              </span>
            </span>
          );
        }
        const overdue = isOverdue(expense, today);
        return (
          <span>
            <Badge tone={overdue ? "danger" : "warning"}>{overdue ? "Overdue" : "To pay"}</Badge>
            {expense.dueDate ? (
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
                Due {formatDate(expense.dueDate)}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (expense) => <span style={textStyle("data")}>{formatPrice(expense.total)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "220px",
      render: (expense) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: spacing[1] }}>
          {/* A fixed slot, so the edit and delete icons line up on paid and unpaid rows alike. */}
          <span style={{ display: "inline-flex", justifyContent: "flex-end", width: 112 }}>
            {expense.status === "pending" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  openPay(expense);
                }}
                style={{
                  ...textStyle("callout"),
                  height: 32,
                  paddingInline: spacing[4],
                  whiteSpace: "nowrap",
                  border: `1px solid ${colors.border}`,
                  backgroundColor: "transparent",
                }}
              >
                Mark paid
              </Button>
            ) : null}
          </span>
          <IconButton
            icon="edit"
            label={`Edit expense of ${formatPrice(expense.total)}`}
            onClick={(event) => {
              event.stopPropagation();
              openForm(expense);
            }}
          />
          <IconButton
            icon="close"
            label={`Delete expense of ${formatPrice(expense.total)}`}
            onClick={(event) => {
              event.stopPropagation();
              setDeleting(expense);
            }}
          />
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      {/* One row: find on the left; filter and add on the right. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[4],
        }}
      >
        <div style={{ maxWidth: 360, width: "100%" }}>
          <Input
            type="search"
            placeholder="Search payee, item, category..."
            aria-label="Search expenses"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFiltersOpen(true)}
            style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
          >
            Filters{groups.length > 0 ? ` · ${groups.length}` : ""}
          </Button>
          <Button type="button" variant="primary" onClick={() => openForm("new")}>
            Add expense
          </Button>
        </div>
      </div>

      <FilterPills
        groups={groups}
        onEdit={() => setFiltersOpen(true)}
        onClearAll={() => {
          setFilters(NO_EXPENSE_FILTERS);
          setPage(1);
        }}
      />

      <Tabs
        aria-label="Bills by payment status"
        tabs={STATUS_TABS}
        value={tab}
        onChange={(next) => {
          setTab(next as StatusTab);
          setPage(1);
        }}
      />

      <StatRow>
        <StatTile label="Paid" value={formatPrice(paidTotal)} hint={rangeLabel || "All time"} />
        <StatTile
          label="To pay"
          value={formatPrice(owedTotal)}
          hint={
            owed.length === 0
              ? "Nothing owed"
              : `${owed.length} ${owed.length === 1 ? "bill" : "bills"}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`
          }
        />
        <StatTile
          label="Bills"
          value={String(filtered.length)}
          hint={`${filtered.reduce((sum, expense) => sum + expense.lines.length, 0)} items in all`}
        />
        <StatTile
          label="Biggest category"
          value={biggest ? biggest[0] : "-"}
          hint={biggest ? formatPrice(biggest[1]) : "Nothing spent"}
        />
      </StatRow>

      {notice ? <Notice>{notice}</Notice> : null}

      {expenses === null ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Loading expenses...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          No expenses for this view.
        </div>
      ) : (
        <div>
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(expense) => expense.id}
            onRowClick={openForm}
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

      <ExpenseFilterSheet
        open={filtersOpen}
        filters={filters}
        categories={categories}
        accounts={accountOptions}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setPage(1);
          setFiltersOpen(false);
        }}
      />

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add expense" : "Edit expense"}
        width={680}
        footer={
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
            <div
              style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}
            >
              <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
                Total · {lines.length} {lines.length === 1 ? "item" : "items"}
              </span>
              <span style={{ ...textStyle("title2"), color: colors.ink }}>
                {formatPrice(formTotal)}
              </span>
            </div>
            <div style={{ display: "flex", gap: spacing[3] }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(null)}
                style={{ flex: 1 }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="expense-form"
                variant="primary"
                disabled={saving}
                style={{ flex: 2 }}
              >
                {editing === "new"
                  ? status === "pending"
                    ? "Add bill to pay"
                    : "Add expense"
                  : "Save changes"}
              </Button>
            </div>
          </div>
        }
      >
        <form
          id="expense-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: spacing[8] }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              columnGap: spacing[4],
              rowGap: spacing[6],
              alignItems: "start",
            }}
          >
            <FormField id="expense-status" label="PAYMENT" span={2}>
              <Chips
                aria-label="Payment status"
                options={[
                  { value: "paid", label: "Paid now" },
                  { value: "pending", label: "Pay later" },
                ]}
                value={status}
                columns={2}
                onChange={(next) => setStatus(next === "pending" ? "pending" : "paid")}
              />
            </FormField>
            <FormField id="expense-payee" label={status === "paid" ? "PAID TO" : "OWED TO"} span={1}>
              <Select
                id="expense-payee"
                options={[
                  ...vendors.map((vendor) => ({ value: vendor.name, label: vendor.name })),
                  // A name typed earlier, or from an older bill, stays selectable.
                  ...(payee !== "" && !vendors.some((vendor) => vendor.name === payee)
                    ? [{ value: payee, label: payee }]
                    : []),
                ]}
                value={payee}
                placeholder="Choose a vendor"
                creatable
                createLabel="Create new vendor"
                aria-label="Paid to"
                onChange={(next) => void pickPayee(next)}
              />
            </FormField>
            <FormField id="expense-reference" label="BILL NUMBER (OPTIONAL)" span={1}>
              <Input
                id="expense-reference"
                autoComplete="off"
                placeholder="From the bill"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </FormField>
            <FormField
              id="expense-date"
              label="DATE"
              span={1}
              error={touched ? problems.date : null}
            >
              <DatePicker id="expense-date" value={date} clearable={false} onChange={setDate} />
            </FormField>
            {status === "paid" ? (
              <>
                <FormField
                  id="expense-account"
                  label="PAID FROM"
                  span={1}
                  error={touched ? problems.account : null}
                >
                  <Select
                    id="expense-account"
                    options={accountOptions}
                    value={accountId}
                    placeholder="Choose an account"
                    searchable={false}
                    aria-invalid={touched && problems.account ? true : undefined}
                    onChange={setAccountId}
                  />
                </FormField>
                <FormField id="expense-paid-date" label="PAID ON" span={1}>
                  <DatePicker
                    id="expense-paid-date"
                    value={paidDate}
                    clearable={false}
                    onChange={setPaidDate}
                  />
                </FormField>
              </>
            ) : (
              <FormField id="expense-due-date" label="DUE ON (OPTIONAL)" span={1}>
                <DatePicker
                  id="expense-due-date"
                  value={dueDate}
                  placeholder="No due date"
                  min={date || undefined}
                  align="right"
                  onChange={setDueDate}
                />
              </FormField>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
            <div style={{ ...textStyle("headline"), color: colors.ink }}>Items</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: LINE_COLUMNS,
                columnGap: spacing[3],
                ...textStyle("caption"),
                color: colors.inkMuted,
              }}
            >
              <span>DESCRIPTION</span>
              <span>CATEGORY</span>
              <span>AMOUNT (₹)</span>
              <span />
            </div>
            {lines.map((row, index) => {
              const bad = touched && lineProblem(row) !== null;
              return (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: LINE_COLUMNS,
                    columnGap: spacing[3],
                    alignItems: "center",
                  }}
                >
                  <Input
                    autoComplete="off"
                    placeholder="What was it"
                    aria-label={`Item ${index + 1} description`}
                    value={row.description}
                    onChange={(event) => updateLine(index, { description: event.target.value })}
                  />
                  <Select
                    options={categories.map((name) => ({ value: name, label: name }))}
                    value={row.category}
                    placeholder="Category"
                    creatable
                    createLabel="Add new category"
                    aria-label={`Item ${index + 1} category`}
                    aria-invalid={bad && row.category.trim() === "" ? true : undefined}
                    onChange={(next) => updateLine(index, { category: next })}
                  />
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    aria-label={`Item ${index + 1} amount`}
                    value={row.amount}
                    aria-invalid={
                      bad && (Number.isNaN(lineAmount(row)) || lineAmount(row) <= 0)
                        ? true
                        : undefined
                    }
                    onChange={(event) => {
                      if (/^\d*\.?\d*$/.test(event.target.value))
                        updateLine(index, { amount: event.target.value });
                    }}
                  />
                  {lines.length > 1 ? (
                    <IconButton
                      icon="close"
                      label={`Remove item ${index + 1}`}
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    />
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
            {touched && problems.lines ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {problems.lines}
              </div>
            ) : null}
            <div>
              <button
                type="button"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    { ...blankLine(), category: current[current.length - 1]?.category ?? "" },
                  ])
                }
                style={{
                  ...textStyle("callout"),
                  height: 36,
                  paddingInline: spacing[4],
                  border: `1px dashed ${colors.border}`,
                  borderRadius: radius.full,
                  background: "transparent",
                  color: colors.inkMuted,
                  cursor: "pointer",
                }}
              >
                + Add item
              </button>
            </div>
          </div>

          <FormField id="expense-note" label="NOTE (OPTIONAL)" span={12}>
            <Input
              id="expense-note"
              autoComplete="off"
              placeholder="Anything worth remembering about this bill"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
        </form>
      </Sheet>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Delete this expense?</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            {deleting
              ? `${formatPrice(deleting.total)}${deleting.payee ? ` to ${deleting.payee}` : ""} on ${formatDate(deleting.date)}. ${deleting.status === "paid" ? `The money goes back into ${accountName(deleting.accountId)}.` : "It hasn't been paid, so no money moves."}`
              : ""}
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={paying !== null} onClose={() => setPaying(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Mark as paid</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            {paying
              ? `${formatPrice(paying.total)}${paying.payee ? ` to ${paying.payee}` : ""}. The money comes out of the account you choose.`
              : ""}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              columnGap: spacing[4],
              marginTop: spacing[5],
              alignItems: "start",
            }}
          >
            <FormField id="pay-account" label="PAID FROM" span={1}>
              <Select
                id="pay-account"
                options={accountOptions}
                value={payAccountId}
                placeholder="Choose an account"
                searchable={false}
                aria-invalid={payError && payAccountId === "" ? true : undefined}
                onChange={(next) => {
                  setPayAccountId(next);
                  setPayError(null);
                }}
              />
            </FormField>
            <FormField id="pay-date" label="PAID ON" span={1}>
              <DatePicker
                id="pay-date"
                value={payDate}
                clearable={false}
                align="right"
                onChange={setPayDate}
              />
            </FormField>
          </div>
          {payError ? (
            <div
              role="alert"
              style={{ ...textStyle("footnote"), color: colors.danger, marginTop: spacing[3] }}
            >
              {payError}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={() => void confirmPay()}>
              Mark paid
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
