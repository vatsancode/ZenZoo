"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Input, Modal, Notice, Switch, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { logAudit } from "../lib/audit";
import {
  addPaymentMethod,
  listPaymentMethods,
  setPaymentMethodEnabled,
  type PaymentMethod,
} from "../lib/payment-options";
import PageHeader from "./PageHeader";

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

  useEffect(() => {
    setMethods([...listPaymentMethods()]);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  function toggle(method: PaymentMethod, enabled: boolean) {
    const error = setPaymentMethodEnabled(method.value, enabled);
    if (error) {
      setMessage(error);
      return;
    }
    logAudit({
      action: "updated",
      module: "Settings",
      entity: "Payment method",
      label: method.label,
      before: { Status: enabled ? "Off" : "On" },
      after: { Status: enabled ? "On" : "Off" },
    });
    setMethods([...listPaymentMethods()]);
    setMessage(
      enabled
        ? `${method.label} is on again.`
        : `${method.label} is off. It no longer shows at the till; past sales keep it.`,
    );
  }

  function submitNew() {
    const error = addPaymentMethod(newName);
    if (error) {
      setAddError(error);
      return;
    }
    logAudit({
      action: "created",
      module: "Settings",
      entity: "Payment method",
      label: newName.trim(),
      before: null,
      after: { Status: "On" },
    });
    setMethods([...listPaymentMethods()]);
    setMessage(`${newName.trim()} added and switched on.`);
    setAdding(false);
  }

  const onCount = methods.filter((method) => method.enabled).length;

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
            key={method.value}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[4],
              minHeight: 76,
              borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
            }}
          >
            <label htmlFor={`method-${method.value}`}>
              <div
                style={{
                  ...textStyle("bodyMedium"),
                  color: method.enabled ? colors.ink : colors.inkMuted,
                }}
              >
                {method.label}
              </div>
              <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {NOTES[method.value] ?? "Added by you."}
              </div>
            </label>
            <Switch
              id={`method-${method.value}`}
              checked={method.enabled}
              onChange={(next) => toggle(method, next)}
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
            submitNew();
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
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Add
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
