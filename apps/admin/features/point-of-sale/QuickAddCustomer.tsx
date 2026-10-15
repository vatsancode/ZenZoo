"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Modal, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import type { Customer } from "../../lib/customers";
import FormField from "../../components/FormField";

export interface QuickAddCustomerProps {
  /** What the cashier typed in the customer box - a phone number or a name. null = closed. */
  typed: string | null;
  onClose: () => void;
  /** Saves; resolves to the new customer, or an error message. */
  onSave: (name: string, phone: string) => Promise<Customer | string>;
  onAdded: (customer: Customer) => void;
}

/** Mostly digits means a phone number was typed, not a name. */
const looksLikePhone = (value: string) => /^\+?[\d\s()-]{6,}$/.test(value.trim());

/** Adding a customer at the counter: name and phone only - the rest is filled in later. */
export default function QuickAddCustomer({
  typed,
  onClose,
  onSave,
  onAdded,
}: QuickAddCustomerProps) {
  const { colors, spacing } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typed === null) return;
    const phoneTyped = looksLikePhone(typed);
    setName(phoneTyped ? "" : typed.trim());
    setPhone(phoneTyped ? typed.trim() : "");
    setTouched(false);
    setSaving(false);
    setError(null);
  }, [typed]);

  const nameError = name.trim() === "" ? "Enter the customer's name." : null;

  async function submit() {
    setTouched(true);
    if (nameError || saving) return;
    setSaving(true);
    setError(null);
    const result = await onSave(name, phone);
    setSaving(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    onAdded(result);
  }

  return (
    <Modal open={typed !== null} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        style={{
          width: 400,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: spacing[5],
        }}
      >
        <div style={{ ...textStyle("title3"), color: colors.ink }}>Add customer</div>
        <FormField
          id="quick-customer-name"
          label="NAME"
          span={12}
          error={touched ? nameError : null}
        >
          <Input
            id="quick-customer-name"
            autoFocus={name === ""}
            autoComplete="off"
            placeholder="e.g. Meenakshi Iyer"
            value={name}
            aria-invalid={touched && nameError ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField id="quick-customer-phone" label="PHONE (OPTIONAL)" span={12} error={error}>
          <Input
            id="quick-customer-phone"
            type="tel"
            autoFocus={name !== ""}
            autoComplete="off"
            placeholder="+91 98765 43210"
            value={phone}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setPhone(event.target.value);
              setError(null);
            }}
          />
        </FormField>
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
          Email, address and notes can be added later from Customers.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Adding..." : "Add customer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
