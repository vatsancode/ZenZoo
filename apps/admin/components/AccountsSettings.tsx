"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Icon, IconButton, Input, Modal, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  accountMovements,
  addAccount,
  balanceOf,
  editAccount,
  listAccounts,
  removeAccount,
  type Account,
  type Movement,
} from "../lib/accounts";
import { formatPrice } from "../lib/stock-display";
import FormField from "./FormField";
import PageHeader from "./PageHeader";

/** The places money is received into and paid from: add, rename, correct the opening balance, remove. */
export default function AccountsSettings() {
  const { colors, radius, spacing } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  // null = closed; an Account = editing it; "new" = adding.
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    setAccounts([...(await listAccounts())]);
    setMovements(await accountMovements());
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function openForm(target: Account | "new") {
    setEditing(target);
    setName(target === "new" ? "" : target.name);
    setOpening(target === "new" ? "" : String(target.opening));
    setError(null);
  }

  function closeForm() {
    setEditing(null);
    setError(null);
  }

  function submit() {
    const amount = opening.trim() === "" ? 0 : Number(opening);
    if (Number.isNaN(amount) || amount < 0) {
      setError("Enter the opening balance as a number, like 25000.");
      return;
    }
    const message =
      editing === "new"
        ? addAccount(name, amount)
        : editing
          ? editAccount(editing.id, name, amount)
          : null;
    if (message) {
      setError(message);
      return;
    }
    setNotice(editing === "new" ? `${name.trim()} added.` : `${name.trim()} updated.`);
    closeForm();
    void reload();
  }

  const usedBy = (account: Account) =>
    movements.filter((movement) => movement.accountId === account.id).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Accounts"
        subtitle="Where money is received into and paid from."
        backHref="/settings"
        backLabel="Back to settings"
        action={
          <Button type="button" variant="primary" onClick={() => openForm("new")}>
            Add account
          </Button>
        }
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
        {accounts.map((account) => {
          const balance = balanceOf(account, movements);
          const count = usedBy(account);
          return (
            <Card
              key={account.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing[5],
                padding: `${spacing[5]}px ${spacing[6]}px`,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  flex: "none",
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSunken,
                  color: colors.ink,
                }}
              >
                <Icon name="bank" size={24} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...textStyle("headline"), color: colors.ink }}>{account.name}</div>
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  <span style={textStyle("dataSmall")}>{account.id}</span> · {count}{" "}
                  {count === 1 ? "transaction" : "transactions"}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 150 }}>
                <div style={{ ...textStyle("title3"), color: colors.ink }}>
                  {formatPrice(balance)}
                </div>
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  Opened with {formatPrice(account.opening)}
                </div>
              </div>
              <div style={{ display: "flex", gap: spacing[1] }}>
                <IconButton
                  icon="edit"
                  label={`Edit ${account.name}`}
                  onClick={() => openForm(account)}
                />
                <IconButton
                  icon="close"
                  label={
                    count > 0
                      ? `${account.name} has transactions and can't be removed`
                      : `Remove ${account.name}`
                  }
                  onClick={() =>
                    count > 0
                      ? setNotice(
                          `${account.name} has ${count} transactions, so it can't be removed.`,
                        )
                      : setRemoving(account)
                  }
                />
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={editing !== null} onClose={closeForm}>
        <form
          style={{ width: 460, maxWidth: "100%" }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>
            {editing === "new" ? "Add account" : "Edit account"}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[6],
              marginTop: spacing[6],
            }}
          >
            <FormField id="account-name" label="NAME" span={12}>
              <Input
                id="account-name"
                autoFocus
                autoComplete="off"
                placeholder="e.g. SBI Savings Account"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
              />
            </FormField>
            <FormField id="account-opening" label="OPENING BALANCE (₹)" span={12}>
              <Input
                id="account-opening"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={opening}
                onChange={(event) => {
                  setOpening(event.target.value);
                  setError(null);
                }}
              />
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                What was in the account before it was tracked here. Sales, payments and transfers
                are added to it.
              </span>
            </FormField>
            {error ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {error}
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editing === "new" ? "Add account" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={removing !== null} onClose={() => setRemoving(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Remove {removing?.name}?</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            It has no transactions, so nothing else is affected. It will no longer be offered when
            taking or making a payment.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (removing) removeAccount(removing.id);
                setRemoving(null);
                void reload();
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
