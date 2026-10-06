"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Button,
  Card,
  DatePicker,
  Icon,
  Input,
  Modal,
  Notice,
  Select,
  textStyle,
} from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  accountMovements,
  addTransfer,
  balanceOf,
  listAccounts,
  type Account,
  type Movement,
} from "./accounts";
import { today } from "../../lib/date-ranges";
import { formatDate, formatPrice } from "../../lib/stock-display";
import FormField from "../../components/FormField";
import PageHeader from "../../components/PageHeader";

const ACTIVITY_SHOWN = 12;

/** What is in each account, what has moved through the selected one, and a way to move money between them. */
export default function TransfersSettings() {
  const { colors, radius, spacing, elevation } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    const list = [...(await listAccounts())];
    setAccounts(list);
    setMovements(await accountMovements());
    setSelectedId((current) => current ?? list[0]?.id ?? null);
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const balances = new Map(accounts.map((account) => [account.id, balanceOf(account, movements)]));
  const total =
    Math.round([...balances.values()].reduce((sum, value) => sum + value, 0) * 100) / 100;
  const selected = accounts.find((account) => account.id === selectedId);
  const activity = movements.filter((movement) => movement.accountId === selectedId);

  const from = accounts.find((account) => account.id === fromId);
  const to = accounts.find((account) => account.id === toId);
  const value = amount.trim() === "" ? 0 : Number(amount);
  const available = from ? (balances.get(from.id) ?? 0) : 0;
  const problems = {
    from: fromId === "" ? "Choose where the money comes from." : null,
    to:
      toId === ""
        ? "Choose where it goes."
        : toId === fromId
          ? "Choose a different account."
          : null,
    amount:
      Number.isNaN(value) || value <= 0
        ? "Enter the amount."
        : from && value > available
          ? `${from.name} only has ${formatPrice(available)}.`
          : null,
    date: date === "" ? "Choose the date." : null,
  };
  const valid = Object.values(problems).every((item) => item === null);

  function openForm(preselectFrom?: string) {
    setFromId(preselectFrom ?? "");
    setToId("");
    setAmount("");
    setDate(today());
    setNote("");
    setTouched(false);
    setOpen(true);
  }

  function submit() {
    setTouched(true);
    if (!valid || !from || !to) return;
    addTransfer({
      date,
      fromId,
      toId,
      amount: Math.round(value * 100) / 100,
      note: note.trim() || undefined,
    });
    setOpen(false);
    setSelectedId(from.id);
    setNotice(`${formatPrice(value)} moved from ${from.name} to ${to.name}.`);
    void reload();
  }

  // A disabled account can't send or receive a transfer, but still shows its balance above.
  const options = accounts
    .filter((account) => !account.disabled)
    .map((account) => ({
      value: account.id,
      label: `${account.name} · ${formatPrice(balances.get(account.id) ?? 0)}`,
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Transfer"
        subtitle="What is in each account, and moving money between them."
        backHref="/settings"
        backLabel="Back to settings"
        action={
          <Button
            type="button"
            variant="primary"
            disabled={accounts.length < 2}
            onClick={() => openForm(selectedId ?? undefined)}
          >
            Transfer money
          </Button>
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <div style={{ display: "flex", alignItems: "baseline", gap: spacing[3] }}>
        <span style={{ ...textStyle("body"), color: colors.inkMuted }}>Across all accounts</span>
        <span style={{ ...textStyle("title1"), color: colors.ink }}>{formatPrice(total)}</span>
      </div>

      <div
        role="radiogroup"
        aria-label="Accounts"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: spacing[4],
        }}
      >
        {accounts.map((account) => {
          const active = account.id === selectedId;
          return (
            <button
              key={account.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelectedId(account.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: spacing[4],
                padding: spacing[5],
                border: `1px solid ${active ? colors.accent : "transparent"}`,
                borderRadius: radius.lg,
                backgroundColor: colors.surfaceRaised,
                boxShadow: active ? "none" : elevation.sm.web,
                color: colors.ink,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing[3],
                  color: colors.inkMuted,
                }}
              >
                <Icon name="bank" size={18} />
                <span style={{ ...textStyle("callout") }}>
                  {account.name}
                  {account.disabled ? " · disabled" : ""}
                </span>
              </span>
              <span style={{ ...textStyle("title1"), color: colors.ink }}>
                {formatPrice(balances.get(account.id) ?? 0)}
              </span>
            </button>
          );
        })}
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: spacing[5],
          }}
        >
          <div style={{ ...textStyle("headline"), color: colors.ink }}>
            {selected ? `${selected.name} activity` : "Activity"}
          </div>
          {selected && accounts.length > 1 ? (
            <button
              type="button"
              onClick={() => openForm(selected.id)}
              style={{
                ...textStyle("bodyMedium"),
                padding: 0,
                border: "none",
                background: "transparent",
                color: colors.accent,
                cursor: "pointer",
              }}
            >
              + Transfer from here
            </button>
          ) : null}
        </div>

        {activity.length === 0 ? (
          <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
            Nothing has moved through this account yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {activity.slice(0, ACTIVITY_SHOWN).map((movement, index) => (
              <div
                key={`${movement.date}-${movement.label}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "104px minmax(0, 1fr) auto",
                  columnGap: spacing[4],
                  alignItems: "center",
                  minHeight: 56,
                  borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                  {formatDate(movement.date)}
                </span>
                <span style={{ ...textStyle("body"), color: colors.ink }}>{movement.label}</span>
                <span
                  style={{
                    ...textStyle("data"),
                    color: movement.amount > 0 ? colors.success : colors.warning,
                  }}
                >
                  {movement.amount > 0 ? "+" : "-"} {formatPrice(Math.abs(movement.amount))}
                </span>
              </div>
            ))}
            {activity.length > ACTIVITY_SHOWN ? (
              <div
                style={{ ...textStyle("footnote"), color: colors.inkMuted, paddingTop: spacing[3] }}
              >
                Showing the latest {ACTIVITY_SHOWN} of {activity.length}.
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)}>
        <form
          style={{ width: 520, maxWidth: "100%" }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Transfer money</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            Move money from one of your accounts to another.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              columnGap: spacing[4],
              rowGap: spacing[6],
              alignItems: "start",
              marginTop: spacing[6],
            }}
          >
            <FormField
              id="transfer-from"
              label="FROM"
              span={1}
              error={touched ? problems.from : null}
            >
              <Select
                id="transfer-from"
                options={options}
                value={fromId}
                placeholder="Choose an account"
                searchable={false}
                aria-invalid={touched && problems.from ? true : undefined}
                onChange={setFromId}
              />
            </FormField>
            <FormField id="transfer-to" label="TO" span={1} error={touched ? problems.to : null}>
              <Select
                id="transfer-to"
                options={options.filter((option) => option.value !== fromId)}
                value={toId}
                placeholder="Choose an account"
                searchable={false}
                aria-invalid={touched && problems.to ? true : undefined}
                onChange={setToId}
              />
            </FormField>
            <FormField
              id="transfer-amount"
              label="AMOUNT (₹)"
              span={1}
              error={touched ? problems.amount : null}
            >
              <Input
                id="transfer-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                aria-invalid={touched && problems.amount ? true : undefined}
                onChange={(event) => setAmount(event.target.value)}
              />
              {from ? (
                <button
                  type="button"
                  onClick={() => setAmount(String(available))}
                  style={{
                    ...textStyle("footnote"),
                    alignSelf: "flex-start",
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: colors.accent,
                    cursor: "pointer",
                  }}
                >
                  Move everything ({formatPrice(available)})
                </button>
              ) : null}
            </FormField>
            <FormField
              id="transfer-date"
              label="DATE"
              span={1}
              error={touched ? problems.date : null}
            >
              <DatePicker
                id="transfer-date"
                value={date}
                clearable={false}
                align="right"
                onChange={setDate}
              />
            </FormField>
            <FormField id="transfer-note" label="NOTE (OPTIONAL)" span={2}>
              <Input
                id="transfer-note"
                autoComplete="off"
                placeholder="e.g. Cash deposited at the bank"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
          </div>

          {from && to && value > 0 && !problems.amount ? (
            <div
              style={{
                ...textStyle("footnote"),
                color: colors.inkMuted,
                marginTop: spacing[5],
                padding: spacing[4],
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSunken,
              }}
            >
              After this: {from.name} {formatPrice(available - value)} · {to.name}{" "}
              {formatPrice((balances.get(to.id) ?? 0) + value)}
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
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Transfer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
