"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Notice, Pagination, Select, Table, textStyle, type TableColumn } from "@zenzoo/ui-web";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { datePresets, isoDate } from "../../lib/date-ranges";
import { formatDate, formatPrice } from "../../lib/stock-display";
import { listAccounts, type Account } from "../settings/accounts";
import {
  LEDGER_KIND_LABELS,
  listLedger,
  type LedgerKind,
  type LedgerPage,
  type LedgerRow,
} from "./ledger";
import StoreSwitcher from "../../components/StoreSwitcher";

const ALL = "";

/** "in" / "out", or one kind of movement - one picker for both. */
const TYPE_OPTIONS = [
  { value: ALL, label: "All money" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
  ...(Object.entries(LEDGER_KIND_LABELS) as [LedgerKind, string][]).map(([kind, label]) => ({
    value: kind,
    label,
  })),
];

const LINK_PATHS = { sale: "/sales", purchase: "/purchases", customer: "/customers" } as const;

/**
 * Every money in and out of the store's accounts, newest first. Read-only on purpose: a ledger
 * row is never changed or removed - a correction shows up as a row of its own.
 */
export default function TransactionsTable() {
  const { colors, spacing } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<LedgerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The store can change while a page is loading; only the newest request may fill the table.
  const latest = useRef(0);
  const [storeVersion, setStoreVersion] = useState(0);

  const presets = datePresets();
  const range = presets.find((preset) => preset.id === period) ?? presets[presets.length - 1]!;

  useEffect(() => {
    listAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [storeVersion]);

  useEffect(() => {
    const request = ++latest.current;
    setError(null);
    listLedger({
      accountId: accountId || undefined,
      direction: type === "in" || type === "out" ? type : undefined,
      kind: type !== ALL && type !== "in" && type !== "out" ? (type as LedgerKind) : undefined,
      from: range.from,
      to: range.to,
      page,
      pageSize,
    })
      .then((result) => {
        if (request === latest.current) setData(result);
      })
      .catch((reason: unknown) => {
        if (request !== latest.current) return;
        setData(null);
        setError(reason instanceof Error ? reason.message : "Couldn't load the transactions.");
      });
    // range comes from period, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, type, period, page, pageSize, storeVersion]);

  const accountOptions = [
    { value: ALL, label: "All accounts" },
    ...accounts.map((account) => ({ value: account.id, label: account.name })),
  ];

  const columns: TableColumn<LedgerRow>[] = [
    {
      key: "when",
      header: "When",
      width: "150px",
      render: (row) => {
        const at = new Date(row.at);
        return (
          <div>
            <div>{formatDate(isoDate(at))}</div>
            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
              {at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
        );
      },
    },
    {
      key: "account",
      header: "Account",
      width: "18%",
      render: (row) => <span style={{ overflowWrap: "anywhere" }}>{row.accountName}</span>,
    },
    {
      key: "details",
      header: "Details",
      render: (row) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ overflowWrap: "anywhere" }}>
            {row.link ? (
              <Link
                href={`${LINK_PATHS[row.link.type]}/${encodeURIComponent(row.link.id)}`}
                style={{ color: colors.accent, textDecoration: "none" }}
              >
                {row.description}
              </Link>
            ) : (
              row.description
            )}
          </div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            {LEDGER_KIND_LABELS[row.kind] ?? LEDGER_KIND_LABELS.other}
            {row.by ? ` · ${row.by}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      width: "140px",
      render: (row) => (
        <span
          style={{
            ...textStyle("data"),
            color: row.amount > 0 ? colors.success : colors.warning,
          }}
        >
          {row.amount > 0 ? "+" : "-"} {formatPrice(Math.abs(row.amount))}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance after",
      align: "right",
      width: "150px",
      render: (row) => <span style={textStyle("data")}>{formatPrice(row.balanceAfter)}</span>,
    },
  ];

  const resetPage =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <div style={{ ...textStyle("body"), color: colors.inkMuted }}>
        Every money in and out of your accounts. A row is never changed or removed; a correction is
        a row of its own.
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[3],
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[3] }}>
          <div style={{ width: 220 }}>
            <Select
              aria-label="Account"
              options={accountOptions}
              value={accountId}
              searchable={false}
              onChange={resetPage(setAccountId)}
            />
          </div>
          <div style={{ width: 220 }}>
            <Select
              aria-label="Type of transaction"
              options={TYPE_OPTIONS}
              value={type}
              searchable={false}
              onChange={resetPage(setType)}
            />
          </div>
          <div style={{ width: 180 }}>
            <Select
              aria-label="Period"
              options={presets.map((preset) => ({ value: preset.id, label: preset.label }))}
              value={period}
              searchable={false}
              onChange={resetPage(setPeriod)}
            />
          </div>
        </div>
        <StoreSwitcher
          onChange={() => {
            setAccountId(ALL);
            setPage(1);
            setStoreVersion((version) => version + 1);
          }}
        />
      </div>

      {error ? <Notice>{error}</Notice> : null}

      {data ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: spacing[8] }}>
          <div>
            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>Money in</div>
            <div style={{ ...textStyle("title3"), color: colors.success }}>
              {formatPrice(data.moneyIn)}
            </div>
          </div>
          <div>
            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>Money out</div>
            <div style={{ ...textStyle("title3"), color: colors.warning }}>
              {formatPrice(data.moneyOut)}
            </div>
          </div>
          <div>
            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>Transactions</div>
            <div style={{ ...textStyle("title3"), color: colors.ink }}>{data.total}</div>
          </div>
        </div>
      ) : null}

      {data && data.rows.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          Nothing has moved in or out for these choices.
        </div>
      ) : null}

      {data && data.rows.length > 0 ? (
        <>
          <Table columns={columns} rows={data.rows} getRowKey={(row) => row.id} />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            onPageChange={setPage}
            pageSizeOptions={[25, 50, 100]}
            onPageSizeChange={resetPage(setPageSize)}
          />
        </>
      ) : null}

      <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
        The list starts from the day it was switched on, with each account&apos;s balance on that
        day. Earlier money is still in Sales, Purchases, Expenses and Transfer.
      </div>
    </div>
  );
}
