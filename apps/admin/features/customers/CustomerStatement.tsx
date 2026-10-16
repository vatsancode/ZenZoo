"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { DatePicker, Pagination, Select, Table, textStyle, type TableColumn } from "@zenzoo/ui-web";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { listCustomerStatement, type StatementEntry } from "../../lib/customers";
import { datePresets, isoDate } from "../../lib/date-ranges";
import { formatPrice } from "../../lib/stock-display";
import StatTile, { StatRow } from "../../components/StatTile";

const money = (value: number) => Math.round(value * 100) / 100;

/** The shop's own calendar day an entry was made, as YYYY-MM-DD - what the timeline filter compares. */
const dayOf = (entry: StatementEntry) => isoDate(new Date(entry.at));

const CUSTOM = "custom";

/** "12 Oct 2026" from YYYY-MM-DD. */
const formatDay = (iso: string) => {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** "12 Oct 2026, 4:05 pm" - when the entry was made, down to the minute. */
function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** What an entry is, in a few words, and the detail under it. */
function describe(entry: StatementEntry): { title: string; detail: string } {
  const sale = entry.saleNumber ? `Sale ${entry.saleNumber}` : "";
  const join = (...parts: (string | null | undefined | false)[]) =>
    parts.filter(Boolean).join(" · ");
  switch (entry.type) {
    case "CREDIT_SALE":
      return entry.methodCode === "STORE_CREDIT"
        ? { title: "Store credit used", detail: join(sale, "paid with store credit") }
        : { title: "Sale on account", detail: join(sale, "left to pay later") };
    case "CREDIT_PAYMENT":
      return {
        title: "Payment received",
        detail: join(
          entry.methodName && entry.accountName
            ? `${entry.methodName} into ${entry.accountName}`
            : entry.methodName,
          entry.reference,
          entry.note,
        ),
      };
    case "CREDIT_REVERSAL":
      return { title: "Sale cancelled", detail: join(sale, "put back as it was") };
    case "SALE_PAYMENT":
      return {
        title: "Paid at the till",
        detail: join(
          sale,
          entry.methodName && entry.accountName
            ? `${entry.methodName} into ${entry.accountName}`
            : entry.methodName,
          entry.reference,
        ),
      };
    case "RETURN_REFUND":
      return {
        title: "Refund paid back",
        detail: join(
          entry.returnNumber ? `Return ${entry.returnNumber}` : null,
          sale,
          entry.methodName && entry.accountName
            ? `${entry.methodName} from ${entry.accountName}`
            : entry.methodName,
        ),
      };
    case "PAYMENT_RETURNED":
      return {
        title: "Payment returned",
        detail: join(
          sale,
          "sale cancelled",
          entry.methodName && entry.accountName
            ? `${entry.methodName} from ${entry.accountName}`
            : entry.methodName,
        ),
      };
    default:
      return entry.returnNumber
        ? {
            title: "Store credit from a return",
            detail: join(`Return ${entry.returnNumber}`, sale),
          }
        : { title: "Adjustment", detail: join(entry.note, sale) };
  }
}

/**
 * A customer's account as a statement: every debit and credit, oldest to newest underneath, newest
 * first on screen, each with the balance right after it. It is a read-only record - the ledger behind
 * it refuses edits and deletes, and a mistake is fixed with a new entry, never by rewriting history.
 */
export default function CustomerStatement({ customerId }: { customerId: string }) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [entries, setEntries] = useState<StatementEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // The timeline: "" means no limit on that side. Both empty is all time.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    setEntries(null);
    setError(null);
    listCustomerStatement(customerId)
      .then(setEntries)
      .catch((reason: unknown) => {
        setEntries([]);
        setError(reason instanceof Error ? reason.message : "Couldn't load the statement.");
      });
  }, [customerId]);

  // The server sends oldest first (that is how the balance builds up). Each line's balance is the
  // real running balance, so it stays right whatever range is showing.
  const all = useMemo(() => entries ?? [], [entries]);
  const backwards = from !== "" && to !== "" && from > to;
  const inRange = useMemo(
    () =>
      all.filter((entry) => {
        const day = dayOf(entry);
        return (from === "" || day >= from) && (to === "" || day <= to);
      }),
    [all, from, to],
  );
  const newestFirst = useMemo(() => [...inRange].reverse(), [inRange]);
  const visible = newestFirst.slice((page - 1) * pageSize, page * pageSize);
  const filtering = from !== "" || to !== "";

  // What the account stood at the moment the range starts: the balance after the last entry before it.
  const before = from === "" ? [] : all.filter((entry) => dayOf(entry) < from);
  const opening = before.length > 0 ? before[before.length - 1]!.balance : 0;
  const balance = inRange.length > 0 ? inRange[inRange.length - 1]!.balance : opening;

  const sumOf = (pick: (entry: StatementEntry) => number) =>
    money(inRange.reduce((sum, entry) => sum + pick(entry), 0));
  const cashIn = sumOf((entry) => Math.max(entry.money ?? 0, 0));
  const cashOut = sumOf((entry) => Math.max(-(entry.money ?? 0), 0));
  const debits = sumOf((entry) => Math.max(entry.amount, 0));
  const credits = sumOf((entry) => Math.max(-entry.amount, 0));

  const presets = datePresets();
  const activePreset = presets.find((range) => range.from === from && range.to === to);
  const presetOptions = [
    ...presets.map(({ id, label }) => ({ value: id, label })),
    { value: CUSTOM, label: "Custom range" },
  ];
  const rangeText = filtering
    ? `${from ? formatDay(from) : "the start"} to ${to ? formatDay(to) : "today"}`
    : "";

  const muted = (text: string) => (
    <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{text}</span>
  );

  const columns: TableColumn<StatementEntry>[] = [
    {
      key: "when",
      header: "Date and time",
      width: "17%",
      render: (entry) => muted(formatMoment(entry.at)),
    },
    {
      key: "what",
      header: "Entry",
      width: "37%",
      render: (entry) => {
        const { title, detail } = describe(entry);
        return (
          <span>
            {title}
            {detail ? (
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
                {detail}
              </span>
            ) : null}
            <span style={{ ...textStyle("footnote"), color: colors.inkFaint, display: "block" }}>
              Entered by {entry.enteredBy}
            </span>
          </span>
        );
      },
    },
    {
      key: "money",
      header: "Money",
      align: "right",
      render: (entry) =>
        entry.money === null ? (
          muted("-")
        ) : (
          <span
            style={{ ...textStyle("data"), color: entry.money > 0 ? colors.success : colors.ink }}
          >
            {entry.money > 0 ? "+ " : "- "}
            {formatPrice(Math.abs(entry.money))}
          </span>
        ),
    },
    {
      key: "debit",
      header: "Debit",
      align: "right",
      render: (entry) =>
        entry.amount > 0 ? (
          <span style={{ ...textStyle("data"), color: colors.warning }}>
            {formatPrice(entry.amount)}
          </span>
        ) : (
          muted("-")
        ),
    },
    {
      key: "credit",
      header: "Credit",
      align: "right",
      render: (entry) =>
        entry.amount < 0 ? (
          <span style={{ ...textStyle("data"), color: colors.success }}>
            {formatPrice(-entry.amount)}
          </span>
        ) : (
          muted("-")
        ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      render: (entry) => (
        <span>
          <span style={textStyle("data")}>{formatPrice(Math.abs(entry.balance))}</span>
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
            {entry.balance > 0 ? "owes you" : entry.balance < 0 ? "store credit" : "settled"}
          </span>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: spacing[3] }}>
        <div style={{ width: 190 }}>
          <Select
            options={presetOptions}
            value={activePreset?.id ?? (filtering ? CUSTOM : "all")}
            searchable={false}
            aria-label="Timeline"
            onChange={(id) => {
              const range = presets.find((item) => item.id === id);
              if (range) {
                setFrom(range.from);
                setTo(range.to);
                setPage(1);
              }
            }}
          />
        </div>
        <div style={{ width: 170 }}>
          <DatePicker
            aria-label="From date"
            value={from}
            placeholder="From"
            max={to || undefined}
            onChange={(next) => {
              setFrom(next);
              setPage(1);
            }}
          />
        </div>
        <div style={{ width: 170 }}>
          <DatePicker
            aria-label="To date"
            value={to}
            placeholder="To"
            min={from || undefined}
            onChange={(next) => {
              setTo(next);
              setPage(1);
            }}
          />
        </div>
        {filtering ? (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setPage(1);
            }}
            style={{
              ...textStyle("callout"),
              height: 44,
              border: "none",
              background: "transparent",
              color: colors.inkMuted,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        ) : null}
        {backwards ? (
          <div
            role="alert"
            style={{ ...textStyle("footnote"), color: colors.danger, alignSelf: "center" }}
          >
            The start date is after the end date.
          </div>
        ) : null}
      </div>

      <StatRow>
        <StatTile
          label={balance < 0 ? "Store credit" : "Owes you"}
          value={formatPrice(Math.abs(balance))}
          hint={
            filtering
              ? `At the end of ${to ? formatDay(to) : "today"}`
              : balance === 0
                ? "Nothing owed either way"
                : balance > 0
                  ? "Left on account"
                  : "Available to spend"
          }
        />
        <StatTile label="Debits" value={formatPrice(debits)} hint="Added to what they owe" />
        <StatTile label="Credits" value={formatPrice(credits)} hint="Paid, or credited back" />
        <StatTile
          label="Money received"
          value={formatPrice(cashIn)}
          hint={filtering ? rangeText : all.length > 0 ? `Since ${formatMoment(all[0]!.at)}` : "-"}
        />
        <StatTile
          label="Money paid back"
          value={formatPrice(cashOut)}
          hint="Refunds and cancelled sales"
        />
      </StatRow>

      {entries === null ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
          Loading the statement...
        </div>
      ) : inRange.length === 0 ? (
        <div
          style={{
            ...textStyle("callout"),
            color: error ? colors.danger : colors.inkMuted,
            padding: spacing[6],
          }}
        >
          {error ??
            (all.length === 0
              ? "Nothing yet. Every sale, payment, refund and credit for this customer appears here once it happens."
              : `No transactions from ${rangeText}.`)}
        </div>
      ) : (
        <div>
          {filtering && from !== "" ? (
            <div
              style={{ ...textStyle("footnote"), color: colors.inkMuted, marginBottom: spacing[3] }}
            >
              Opening balance on {formatDay(from)}:{" "}
              <span style={{ ...textStyle("data"), color: colors.ink }}>
                {formatPrice(Math.abs(opening))}
              </span>{" "}
              {opening > 0 ? "owed" : opening < 0 ? "store credit" : "(settled)"}
            </div>
          ) : null}
          <Table
            columns={columns}
            rows={visible}
            getRowKey={(entry) => entry.id}
            onRowClick={(entry) => {
              if (entry.saleId) router.push(`/sales/${encodeURIComponent(entry.saleId)}`);
            }}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={newestFirst.length}
            onPageChange={setPage}
            pageSizeOptions={[10, 25, 50]}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}
