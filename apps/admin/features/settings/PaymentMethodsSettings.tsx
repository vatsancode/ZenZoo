"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Input, Modal, Notice, Switch, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  addPaymentMethod,
  listPaymentMethods,
  setPaymentMethodEnabled,
  type PaymentMethod,
} from "./paymentMethods";
import PageHeader from "../../components/PageHeader";

const NOTES: Record<string, string> = {
  CASH: "Money handed over at the till.",
  UPI: "Payments from any UPI app.",
  CARD: "Debit and credit cards.",
  BANK_TRANSFER: "Direct transfers to your bank account.",
};

/** Which ways of paying are offered at the till and in forms. Switching one off keeps its past sales. */
export default function PaymentMethodsSettings() {
  const { colors, spacing } = useTheme();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setMethods(await listPaymentMethods());
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  async function toggle(method: PaymentMethod, enabled: boolean) {
    const error = await setPaymentMethodEnabled(method.id, enabled);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage(
      enabled
        ? `${method.name} is on again.`
        : `${method.name} is off. It no longer shows at the till; past sales keep it.`,
    );
    void reload();
  }

  async function submitNew() {
    setSaving(true);
    const result = await addPaymentMethod(newName);
    setSaving(false);
    if (typeof result === "string") {
      setAddError(result);
      return;
    }
    setMessage(`${result.name} added and switched on.`);
    setAdding(false);
    void reload();
  }

  const onCount = methods.filter((method) => method.status === "active").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Payment methods"
        subtitle="Choose the ways customers can pay."
        backHref="/settings"
        backLabel="Back to settings"
        action={
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setNewName("");
              setAddError(null);
              setAdding(true);
            }}
          >
            Add payment method
          </Button>
        }
      />

      {message ? <Notice>{message}</Notice> : null}

      <Card style={{ padding: `${spacing[2]}px ${spacing[6]}px` }}>
        {methods.map((method, index) => (
          <div
            key={method.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[4],
              minHeight: 76,
              borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
            }}
          >
            <label htmlFor={`method-${method.id}`}>
              <div
                style={{
                  ...textStyle("bodyMedium"),
                  color: method.status === "active" ? colors.ink : colors.inkMuted,
                }}
              >
                {method.name}
              </div>
              <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {NOTES[method.code] ?? "Added by you."}
              </div>
            </label>
            <Switch
              id={`method-${method.id}`}
              checked={method.status === "active"}
              onChange={(next) => void toggle(method, next)}
            />
          </div>
        ))}
      </Card>

      <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
        {onCount} of {methods.length} on. At least one stays on. Store credit and paying later (on
        account) are separate from these and are always available when they apply.
      </div>

      <Modal open={adding} onClose={() => setAdding(false)}>
        <form
          style={{ width: 420, maxWidth: "100%" }}
          onSubmit={(event) => {
            event.preventDefault();
            void submitNew();
          }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Add payment method</div>
          <div style={{ marginTop: spacing[5] }}>
            <Input
              autoFocus
              autoComplete="off"
              aria-label="Payment method name"
              placeholder="e.g. Cheque, Paytm wallet, Gift voucher"
              value={newName}
              disabled={saving}
              onChange={(event) => {
                setNewName(event.target.value);
                setAddError(null);
              }}
            />
            {addError ? (
              <div
                role="alert"
                style={{ ...textStyle("footnote"), color: colors.danger, marginTop: spacing[2] }}
              >
                {addError}
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
            <Button type="button" variant="secondary" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
