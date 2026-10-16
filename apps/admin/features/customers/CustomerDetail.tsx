"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Card,
  Notice,
  Pagination,
  Table,
  Tabs,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { creditEntries, customerSales, netSpent, preferencesOf } from "./customer-insights";
import { paymentMethodLabel } from "../../lib/payment-options";
import {
  dueEntries,
  listSales,
  SALE_STATUS_LABEL,
  salePaymentLabel,
  saleRefundTotal,
  saleStatus,
  type DueCollection,
  type Sale,
} from "../sales/sales";
import {
  creditOf,
  editCustomer,
  getCustomer,
  listCollections,
  listCustomerPaymentOptions,
  listCustomers,
  owesOf,
  receivePayment,
  setCustomerArchived,
  type Customer,
} from "../../lib/customers";
import type { TillPaymentOptions } from "../../lib/till";
import { formatDate, formatPrice } from "../../lib/stock-display";
import CustomerDues from "./CustomerDues";
import RecordPaymentModal from "./RecordPaymentModal";
import CustomerStatement from "./CustomerStatement";
import CustomerSheet from "./CustomerSheet";
import PageHeader from "../../components/PageHeader";
import StatTile, { StatRow } from "../../components/StatTile";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "Purchase history" },
  { id: "statement", label: "Account statement" },
];

function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <div style={{ marginBottom: spacing[5] }}>
      <div style={{ ...textStyle("headline"), color: colors.ink }}>{children}</div>
      {hint ? (
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** One customer: who they are, their store credit, what they like to buy, and everything they have bought. */
export default function CustomerDetail({ customerId }: { customerId: string }) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  // undefined while loading, null when there is no such customer.
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [sales, setSales] = useState<Sale[]>([]);
  const [collections, setCollections] = useState<DueCollection[]>([]);
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [everyone, setEveryone] = useState<Customer[]>([]);
  const [archiving, setArchiving] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState<TillPaymentOptions | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    getCustomer(customerId).then(setCustomer);
    // Only to point at whoever holds a phone number that's already taken, so failing is fine.
    listCustomers(true)
      .then(setEveryone)
      .catch(() => setEveryone([]));
    listSales({ customerId })
      .then(setSales)
      .catch(() => setSales([]));
    listCollections(customerId)
      .then(setCollections)
      .catch(() => setCollections([]));
    // Only needed to take a payment, which needs customers:edit - fine to be missing otherwise.
    listCustomerPaymentOptions()
      .then(setPaymentOptions)
      .catch(() => setPaymentOptions(null));
  }, [customerId]);

  const mine = useMemo(() => customerSales(sales, customerId), [sales, customerId]);
  const entries = useMemo(() => creditEntries(mine), [mine]);
  const dues = useMemo(
    () =>
      dueEntries(
        mine,
        collections.filter((item) => item.customerId === customerId),
      ),
    [mine, collections, customerId],
  );
  // Each sale line carries its item's category, so no separate product list is needed.
  const categoryByProduct = useMemo(
    () =>
      new Map(
        mine.flatMap((sale) =>
          sale.lines.map((line) => [line.productId, line.category ?? "Other"] as const),
        ),
      ),
    [mine],
  );
  const preferences = useMemo(
    () => preferencesOf(mine, (productId) => categoryByProduct.get(productId) ?? "Other"),
    [mine, categoryByProduct],
  );

  if (customer === undefined) {
    return (
      <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>Loading customer...</div>
    );
  }

  if (customer === null) {
    return (
      <>
        <PageHeader
          title="Customer not found"
          backHref="/customers"
          backLabel="Back to customers"
        />
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          This customer doesn&apos;t exist, or you don&apos;t have access to customers.
        </div>
      </>
    );
  }

  const spent = netSpent(mine);
  // What they owe, or the store credit they hold, comes from the server's ledger total.
  const balance = creditOf(customer);
  const owed = owesOf(customer);
  const issued = entries
    .filter((entry) => entry.amount > 0)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const spentCredit = entries
    .filter((entry) => entry.amount < 0)
    .reduce((sum, entry) => sum - entry.amount, 0);
  const average = mine.length > 0 ? Math.round(spent / mine.length) : 0;
  const pageCount = Math.max(1, Math.ceil(mine.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = mine.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const historyColumns: TableColumn<Sale>[] = [
    {
      key: "number",
      header: "Invoice",
      width: "14%",
      render: (sale) => (
        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{sale.number}</span>
      ),
    },
    { key: "date", header: "Date", render: (sale) => formatDate(sale.date) },
    {
      key: "items",
      header: "Items",
      width: "30%",
      render: (sale) => {
        const units = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
        return (
          <span>
            {units} {units === 1 ? "item" : "items"}
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
              {sale.lines.map((line) => line.name).join(", ")}
            </span>
          </span>
        );
      },
    },
    {
      key: "payment",
      header: "Payment",
      render: (sale) => salePaymentLabel(sale),
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
      key: "total",
      header: "Total",
      align: "right",
      render: (sale) => (
        <span>
          <span style={textStyle("data")}>{formatPrice(sale.total)}</span>
          {saleRefundTotal(sale) > 0 ? (
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
              {formatPrice(saleRefundTotal(sale))} returned
            </span>
          ) : null}
        </span>
      ),
    },
  ];

  // A thin bar whose width is the share, so the favourites read at a glance.
  const bar = (share: number) => (
    <div
      aria-hidden="true"
      style={{
        height: 6,
        marginTop: spacing[2],
        borderRadius: radius.full,
        backgroundColor: colors.surfaceSunken,
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${share}%`, height: "100%", backgroundColor: colors.accent }} />
    </div>
  );

  async function toggleArchived() {
    if (!customer) return;
    setArchiving(true);
    const archive = customer.status === "active";
    const result = await setCustomerArchived(customer.id, archive);
    setArchiving(false);
    if (typeof result === "string") {
      setNotice(result);
      return;
    }
    setCustomer(result);
    setNotice(
      archive
        ? `${result.name} archived. They no longer appear at the till; restore them any time.`
        : `${result.name} restored.`,
    );
  }

  const nothingYet = (text: string) => (
    <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>{text}</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title={customer.name}
        subtitle={
          [customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"
        }
        backHref="/customers"
        backLabel="Back to customers"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
            {customer.status === "archived" ? <Badge tone="neutral">Archived</Badge> : null}
            {owed > 0 ? <Badge tone="warning">{formatPrice(owed)} due</Badge> : null}
            {balance > 0 ? <Badge tone="success">{formatPrice(balance)} store credit</Badge> : null}
            <Button type="button" variant="primary" onClick={() => setPaymentOpen(true)}>
              Record payment
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditOpen(true)}
              style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
            >
              Edit customer
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={archiving}
              onClick={() => void toggleArchived()}
              style={{ backgroundColor: "transparent", border: `1px solid ${colors.border}` }}
            >
              {customer.status === "archived" ? "Restore" : "Archive"}
            </Button>
          </div>
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <Tabs aria-label="Customer sections" tabs={TABS} value={tab} onChange={setTab} />

      <div
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}
      >
        {tab === "overview" ? (
          <>
            <StatRow>
              <StatTile
                label="Total spent"
                value={formatPrice(spent)}
                hint={mine.length > 0 ? "After returns" : "No purchases yet"}
              />
              <StatTile
                label="Purchases"
                value={String(mine.length)}
                hint={mine[0] ? `Last on ${formatDate(mine[0].date)}` : "-"}
              />
              <StatTile
                label="Average bill"
                value={mine.length > 0 ? formatPrice(average) : "-"}
                hint={
                  preferences.discountPercent > 0
                    ? `${preferences.discountPercent}% usually off`
                    : "Rarely discounted"
                }
              />
              <StatTile
                label="Store credit"
                value={formatPrice(balance)}
                hint={balance > 0 ? "Available to spend at the till" : "No credit"}
              />
              <StatTile
                label="Owes you"
                value={formatPrice(owed)}
                hint={owed > 0 ? "Left on account" : "Nothing due"}
              />
            </StatRow>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 2fr)",
                gap: spacing[6],
                alignItems: "stretch",
              }}
            >
              <Card style={{ display: "flex", flexDirection: "column" }}>
                <CardTitle>Details</CardTitle>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    justifyContent: "space-between",
                  }}
                >
                  {[
                    { label: "Phone", value: customer.phone ?? "-" },
                    { label: "Email", value: customer.email ?? "-" },
                    { label: "Address", value: customer.address ?? "-" },
                    { label: "Notes", value: customer.notes ?? "-" },
                    {
                      label: "Customer since",
                      value: formatDate(customer.since),
                    },
                    { label: "Last purchase", value: mine[0] ? formatDate(mine[0].date) : "-" },
                  ].map((row, index) => (
                    <div
                      key={row.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: spacing[4],
                        flex: 1,
                        minHeight: 52,
                        borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      <span style={{ ...textStyle("body"), color: colors.inkMuted }}>
                        {row.label}
                      </span>
                      <span style={{ ...textStyle("body"), color: colors.ink, textAlign: "right" }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card style={{ display: "flex", flexDirection: "column" }}>
                <CardTitle hint="Credit from returns, less what has been spent.">
                  Store credit
                </CardTitle>

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: spacing[6],
                    flexWrap: "wrap",
                    paddingBottom: spacing[6],
                  }}
                >
                  <div>
                    <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>BALANCE</div>
                    <div
                      style={{
                        ...textStyle("display"),
                        color: balance > 0 ? colors.success : colors.ink,
                        marginTop: spacing[1],
                      }}
                    >
                      {formatPrice(balance)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: spacing[8] }}>
                    {[
                      { label: "ISSUED", value: issued },
                      { label: "SPENT", value: spentCredit },
                    ].map((fact) => (
                      <div key={fact.label}>
                        <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>
                          {fact.label}
                        </div>
                        <div
                          style={{
                            ...textStyle("title3"),
                            color: colors.ink,
                            marginTop: spacing[1],
                          }}
                        >
                          {formatPrice(fact.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {entries.length === 0 ? (
                  nothingYet("No store credit has been issued to this customer.")
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {entries.map((entry, index) => (
                      <div
                        key={`${entry.kind}-${entry.reference}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "96px minmax(0, 1fr) auto",
                          columnGap: spacing[4],
                          alignItems: "center",
                          minHeight: 60,
                          borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                          borderBottom: `1px solid ${colors.border}`,
                        }}
                      >
                        <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                          {formatDate(entry.date)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...textStyle("body"), color: colors.ink }}>
                            {entry.kind === "issued"
                              ? `Credit for return ${entry.reference}`
                              : `Used on sale ${entry.reference}`}
                          </div>
                          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                            {entry.detail}
                          </div>
                        </div>
                        <span
                          style={{
                            ...textStyle("data"),
                            color: entry.amount > 0 ? colors.success : colors.warning,
                          }}
                        >
                          {entry.amount > 0 ? "+" : "-"} {formatPrice(Math.abs(entry.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {dues.length > 0 || owed > 0 ? (
              <CustomerDues entries={dues} owed={owed} onRecord={() => setPaymentOpen(true)} />
            ) : null}

            <Card>
              <CardTitle hint="Worked out from what they have bought, after returns.">
                Purchase preferences
              </CardTitle>
              {mine.length === 0 ? (
                nothingYet("Preferences appear once this customer has made a purchase.")
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    alignItems: "start",
                  }}
                >
                  {[
                    {
                      key: "categories",
                      title: "FAVOURITE CATEGORIES",
                      body: preferences.categories.map((category) => (
                        <div key={category.name}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: spacing[3],
                            }}
                          >
                            <span style={{ ...textStyle("body"), color: colors.ink }}>
                              {category.name}
                            </span>
                            <span style={{ ...textStyle("data"), color: colors.inkMuted }}>
                              {formatPrice(category.spend)} · {category.share}%
                            </span>
                          </div>
                          {bar(category.share)}
                        </div>
                      )),
                    },
                    {
                      key: "items",
                      title: "MOST BOUGHT",
                      body: preferences.items.map((item, index) => (
                        <div
                          key={item.name}
                          style={{ display: "flex", alignItems: "center", gap: spacing[3] }}
                        >
                          <span
                            style={{
                              ...textStyle("caption"),
                              width: 24,
                              height: 24,
                              flex: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: radius.full,
                              backgroundColor: colors.surfaceSunken,
                              color: colors.inkMuted,
                            }}
                          >
                            {index + 1}
                          </span>
                          <span
                            style={{
                              ...textStyle("body"),
                              color: colors.ink,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {item.name}
                          </span>
                          <span style={{ ...textStyle("data"), color: colors.inkMuted }}>
                            {item.units} {item.units === 1 ? "pc" : "pcs"}
                          </span>
                        </div>
                      )),
                    },
                    {
                      key: "methods",
                      title: "HOW THEY PAY",
                      body: preferences.methods.map((method) => (
                        <div key={method.code}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: spacing[3],
                            }}
                          >
                            <span style={{ ...textStyle("body"), color: colors.ink }}>
                              {paymentMethodLabel(method.code)}
                            </span>
                            <span style={{ ...textStyle("data"), color: colors.inkMuted }}>
                              {method.count} of {mine.length} · {method.share}%
                            </span>
                          </div>
                          {bar(method.share)}
                        </div>
                      )),
                    },
                  ].map((column, index) => (
                    <div
                      key={column.key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: spacing[5],
                        padding: `0 ${spacing[6]}px`,
                        paddingLeft: index === 0 ? 0 : spacing[6],
                        borderLeft: index === 0 ? "none" : `1px solid ${colors.border}`,
                      }}
                    >
                      <div style={{ ...textStyle("caption"), color: colors.inkMuted }}>
                        {column.title}
                      </div>
                      {column.body}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : tab === "statement" ? (
          <CustomerStatement customerId={customerId} />
        ) : (
          <Card>
            <CardTitle>Purchase history</CardTitle>
            {mine.length === 0 ? (
              nothingYet("This customer hasn't bought anything yet.")
            ) : (
              <>
                <Table
                  columns={historyColumns}
                  rows={visible}
                  getRowKey={(sale) => sale.id}
                  onRowClick={(sale) => router.push(`/sales/${encodeURIComponent(sale.id)}`)}
                />
                <Pagination
                  page={currentPage}
                  pageSize={pageSize}
                  total={mine.length}
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
        )}
      </div>

      <RecordPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        customerName={customer.name}
        owed={owed}
        options={paymentOptions}
        onSave={async (input) => {
          const result = await receivePayment(customerId, {
            amount: input.amount,
            paymentMethodId: input.methodId,
            paymentAccountId: input.accountId,
            note: input.note,
            keepExtraAsCredit: input.keepExtraAsCredit,
          });
          if (typeof result === "string") return result;
          // Their balance, the list of payments and the statement have all changed.
          getCustomer(customerId).then(setCustomer);
          listCollections(customerId)
            .then(setCollections)
            .catch(() => undefined);
          setPaymentOpen(false);
          setNotice(
            result.keptAsCredit > 0
              ? `Recorded ${formatPrice(input.amount)} received. ${formatPrice(result.keptAsCredit)} is kept as store credit.`
              : `Recorded ${formatPrice(input.amount)} received.`,
          );
          return null;
        }}
      />

      <CustomerSheet
        open={editOpen}
        customer={customer}
        existing={everyone}
        onClose={() => setEditOpen(false)}
        onOpenCustomer={(id) => {
          setEditOpen(false);
          router.push(`/customers/${encodeURIComponent(id)}`);
        }}
        onSubmit={async (input) => {
          const result = await editCustomer(customer.id, input);
          if (typeof result === "string") return result;
          setCustomer(result);
          setEditOpen(false);
          setNotice("Customer updated.");
          return null;
        }}
      />
    </div>
  );
}
