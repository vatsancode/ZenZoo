"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Button,
  Card,
  Icon,
  IconButton,
  Input,
  Modal,
  Notice,
  Switch,
  textStyle,
} from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { useAccess } from "../../lib/access";
import { NAME_MAX, cleanName } from "../../lib/text";
import { useListOrder } from "../../lib/useListOrder";
import { useSingleFlight } from "../../lib/useSingleFlight";
import {
  addPaymentMethod,
  listPaymentMethods,
  renamePaymentMethod,
  reorderPaymentMethods,
  resetPaymentMethodOrder,
  setPaymentMethodEnabled,
  type PaymentMethod,
} from "./paymentMethods";
import MoveButtons from "../../components/MoveButtons";
import PageHeader from "../../components/PageHeader";

const NOTES: Record<string, string> = {
  CASH: "Money handed over at the till.",
  UPI: "Payments from any UPI app.",
  CARD: "Debit and credit cards.",
  BANK_TRANSFER: "Direct transfers to your bank account.",
  STORE_CREDIT: "Paid from credit the customer holds with you.",
  ON_ACCOUNT: "Left owing, to be paid later.",
};

/**
 * Which ways of paying are offered at the till and in forms. Switching one off keeps its past
 * sales. The shop's own methods can be renamed; the built-in ones can't, since the till acts on them.
 */
export default function PaymentMethodsSettings() {
  const { colors, spacing } = useTheme();
  const canEdit = useAccess().can("settings", "edit");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  // The Add / Rename box: null while closed, `renaming` null when adding a new one.
  const [dialog, setDialog] = useState<{ renaming: PaymentMethod | null } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const { busy: saving, run } = useSingleFlight();

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

  function openDialog(renaming: PaymentMethod | null) {
    setDraftName(renaming?.name ?? "");
    setDialogError(null);
    setDialog({ renaming });
  }

  function submitDialog() {
    return run(async () => {
      const renaming = dialog?.renaming;
      if (renaming) {
        const problem = await renamePaymentMethod(renaming, draftName);
        if (problem) {
          setDialogError(problem);
          return;
        }
        const renamed = cleanName(draftName);
        if (renamed !== renaming.name) {
          setMessage(`Renamed ${renaming.name} to ${renamed}. Past sales show the new name.`);
        }
      } else {
        const result = await addPaymentMethod(draftName);
        if (typeof result === "string") {
          setDialogError(result);
          return;
        }
        setMessage(`${result.name} added and switched on.`);
      }
      setDialog(null);
      void reload();
    });
  }

  const order = useListOrder({
    enabled: canEdit,
    items: methods,
    setItems: setMethods,
    reload,
    save: reorderPaymentMethods,
    reset: resetPaymentMethodOrder,
    notify: setMessage,
  });

  const hasOwnOrder = methods.some((method) => method.sortOrder !== null);
  const onCount = methods.filter((method) => method.status === "active").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Payment methods"
        subtitle="Choose the ways customers can pay, and the order they are shown in."
        backHref="/settings"
        backLabel="Back to settings"
        action={
          canEdit ? (
            <Button type="button" variant="primary" onClick={() => openDialog(null)}>
              Add payment method
            </Button>
          ) : undefined
        }
      />

      {message ? <Notice>{message}</Notice> : null}

      <Card style={{ padding: `${spacing[2]}px ${spacing[6]}px` }}>
        {methods.map((method, index) => (
          <div
            key={method.id}
            {...order.rowProps(method.id, index)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing[4],
              minHeight: 76,
              borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
              opacity: order.dragId === method.id ? 0.5 : 1,
              backgroundColor:
                order.overId === method.id && order.dragId !== method.id
                  ? colors.surfaceSunken
                  : "transparent",
            }}
          >
            {canEdit ? (
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  color: colors.inkMuted,
                  cursor: order.ordering ? "not-allowed" : "grab",
                }}
              >
                <Icon name="grip" />
              </span>
            ) : null}
            <label htmlFor={`method-${method.id}`} style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  ...textStyle("bodyMedium"),
                  color: method.status === "active" ? colors.ink : colors.inkMuted,
                  overflowWrap: "anywhere",
                }}
              >
                {method.name}
              </div>
              <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {NOTES[method.code] ?? "Added by you."}
                {method.builtIn && canEdit ? " Built-in, can't be renamed." : ""}
              </div>
            </label>
            {canEdit && !method.builtIn ? (
              <IconButton
                icon="edit"
                label={`Rename ${method.name}`}
                disabled={saving}
                onClick={() => openDialog(method)}
              />
            ) : null}
            {canEdit ? (
              <MoveButtons
                name={method.name}
                index={index}
                count={methods.length}
                disabled={order.ordering}
                onMove={(toIndex) => void order.move(method.id, toIndex)}
              />
            ) : null}
            <Switch
              id={`method-${method.id}`}
              disabled={!canEdit}
              checked={method.status === "active"}
              onChange={(next) => void toggle(method, next)}
            />
          </div>
        ))}
      </Card>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing[4],
        }}
      >
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
          {onCount} of {methods.length} on. At least one stays on. Store credit and paying later (on
          account) are separate from these and are always available when they apply.
          {canEdit
            ? " Drag a row, or use the arrows, to change the order. It applies at the till and in forms."
            : ""}
        </div>
        {canEdit && hasOwnOrder ? (
          <Button
            type="button"
            variant="secondary"
            disabled={order.ordering}
            onClick={() => void order.resetOrder()}
          >
            Reset to A to Z
          </Button>
        ) : null}
      </div>

      <Modal open={dialog !== null} onClose={() => setDialog(null)}>
        <form
          style={{ width: 420, maxWidth: "100%" }}
          onSubmit={(event) => {
            event.preventDefault();
            void submitDialog();
          }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>
            {dialog?.renaming ? `Rename ${dialog.renaming.name}` : "Add payment method"}
          </div>
          {dialog?.renaming ? (
            <div
              style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[2] }}
            >
              Past sales and statements will show the new name too.
            </div>
          ) : null}
          <div style={{ marginTop: spacing[5] }}>
            <Input
              autoFocus
              autoComplete="off"
              aria-label="Payment method name"
              placeholder="e.g. Cheque, Paytm wallet, Gift voucher"
              maxLength={NAME_MAX}
              value={draftName}
              disabled={saving}
              aria-invalid={dialogError ? true : undefined}
              onChange={(event) => {
                setDraftName(event.target.value);
                setDialogError(null);
              }}
            />
            {dialogError ? (
              <div
                role="alert"
                style={{ ...textStyle("footnote"), color: colors.danger, marginTop: spacing[2] }}
              >
                {dialogError}
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialog(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {dialog?.renaming ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
