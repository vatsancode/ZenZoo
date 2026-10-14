"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Card, Icon, IconButton, Input, Modal, Notice, Switch, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  addAccount,
  editAccount,
  listAccounts,
  listTransfers,
  setAccountDisabled,
  transferMovements,
  type Account,
  type Transfer,
} from "./accounts";
import { formatPrice } from "../../lib/stock-display";
import FormField from "../../components/FormField";
import PageHeader from "../../components/PageHeader";

/** The places money is received into and paid from: add, rename, correct the opening balance, switch on/off. */
export default function AccountsSettings() {
  const { colors, radius, spacing } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  // null = closed; an Account = editing it; "new" = adding.
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    setAccounts(await listAccounts());
    setTransfers(await listTransfers());
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
    setOpening(target === "new" ? "" : String(target.openingBalance));
    setError(null);
  }

  function closeForm() {
    setEditing(null);
    setError(null);
  }

  async function submit() {
    const amount = opening.trim() === "" ? 0 : Number(opening);
    if (Number.isNaN(amount) || amount < 0) {
      setError("Enter the opening balance as a number, like 25000.");
      return;
    }
    setSaving(true);
    const result =
      editing === "new" ? await addAccount(name, amount) : editing ? await editAccount(editing.id, name, amount) : null;
    setSaving(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setNotice(editing === "new" ? `${name.trim()} added.` : `${name.trim()} updated.`);
    closeForm();
    void reload();
  }

  const movements = transferMovements(accounts, transfers);
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
          const disabled = account.status === "disabled";
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
                <div
                  style={{
                    ...textStyle("headline"),
                    color: disabled ? colors.inkMuted : colors.ink,
                    display: "flex",
                    alignItems: "center",
                    gap: spacing[3],
                  }}
                >
                  {account.name}
                  {disabled ? <Badge tone="neutral">Disabled</Badge> : null}
                </div>
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  <span style={textStyle("dataSmall")}>{account.code}</span> · {count}{" "}
                  {count === 1 ? "transfer" : "transfers"}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 150 }}>
                <div style={{ ...textStyle("title3"), color: colors.ink }}>
                  {formatPrice(account.balance)}
                </div>
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  Opened with {formatPrice(account.openingBalance)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
                <Switch
                  checked={!disabled}
                  aria-label={disabled ? `Turn ${account.name} on` : `Turn ${account.name} off`}
                  onChange={(on) => {
                    void setAccountDisabled(account.id, !on).then((result) => {
                      if (result) setNotice(result);
                      else {
                        setNotice(
                          on
                            ? `${account.name} is on again.`
                            : `${account.name} is off. It keeps its history and balance but isn't offered for new payments.`,
                        );
                        void reload();
                      }
                    });
                  }}
                />
                <IconButton icon="edit" label={`Edit ${account.name}`} onClick={() => openForm(account)} />
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
            void submit();
          }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>
            {editing === "new" ? "Add account" : "Edit account"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[6], marginTop: spacing[6] }}>
            <FormField id="account-name" label="NAME" span={12}>
              <Input
                id="account-name"
                autoFocus
                autoComplete="off"
                placeholder="e.g. SBI Savings Account"
                value={name}
                disabled={saving}
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
                disabled={saving}
                onChange={(event) => {
                  setOpening(event.target.value);
                  setError(null);
                }}
              />
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                What was in the account before it was tracked here. Sales, payments and transfers are
                added to it.
              </span>
            </FormField>
            {error ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {error}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[3], marginTop: spacing[6] }}>
            <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving..." : editing === "new" ? "Add account" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
