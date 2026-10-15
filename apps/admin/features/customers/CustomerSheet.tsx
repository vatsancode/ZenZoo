"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState, type KeyboardEvent } from "react";
import type { Customer, CustomerInput } from "../../lib/customers";
import { emailProblem } from "../vendors/vendors";
import FormField from "../../components/FormField";

export type { CustomerInput };

interface CustomerSheetProps {
  open: boolean;
  /** When set, the panel edits this customer instead of adding a new one. */
  customer?: Customer | null;
  /** Everyone already known - to point at whoever holds a phone number that's taken. */
  existing?: Customer[];
  onClose: () => void;
  /** Saves; resolves to an error message to show, or null when it worked. */
  onSubmit: (input: CustomerInput) => Promise<string | null>;
  /** Opens another customer's profile - offered when the phone number is already theirs. */
  onOpenCustomer?: (id: string) => void;
}

const ORDER = [
  "customer-name",
  "customer-phone",
  "customer-email",
  "customer-address",
  "customer-notes",
];

/** Same rule as the server's normalisePhone: digits, plus a leading + if typed. */
const samePhone = (a: string, b: string) => {
  const clean = (value: string) =>
    (value.trim().startsWith("+") ? "+" : "") + value.replace(/\D/g, "");
  return clean(a) !== "" && clean(a) === clean(b);
};

/** Adds or edits a customer: just a name is required, everything else can come later. */
export default function CustomerSheet({
  open,
  customer = null,
  existing = [],
  onClose,
  onSubmit,
  onOpenCustomer,
}: CustomerSheetProps) {
  const { colors, spacing } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    setName(open && customer ? customer.name : "");
    setPhone(open && customer ? (customer.phone ?? "") : "");
    setEmail(open && customer ? (customer.email ?? "") : "");
    setAddress(open && customer ? (customer.address ?? "") : "");
    setNotes(open && customer ? (customer.notes ?? "") : "");
    setTouched(false);
    setSaving(false);
    setServerError(null);
  }, [open, customer]);

  const nameError = name.trim() === "" ? "Enter the customer's name." : null;
  const emailError = emailProblem(email);
  // The server's "This number belongs to ..." goes under the phone field; anything else at the bottom.
  const phoneTaken = serverError?.startsWith("This number") ? serverError : null;
  const otherError = serverError && !phoneTaken ? serverError : null;
  const phoneOwner = phoneTaken
    ? existing.find((other) => other.id !== customer?.id && samePhone(other.phone ?? "", phone))
    : undefined;

  async function submit() {
    setTouched(true);
    if (nameError || emailError || saving) return;
    setSaving(true);
    setServerError(null);
    const message = await onSubmit({ name, phone, email, address, notes });
    setSaving(false);
    setServerError(message);
  }

  function enterFrom(id: string) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const next = ORDER[ORDER.indexOf(id) + 1];
      if (next) document.getElementById(next)?.focus();
      else void submit();
    };
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={customer ? "Edit customer" : "Add customer"}
      width={480}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="customer-form"
            variant="primary"
            disabled={saving}
            style={{ flex: 2 }}
          >
            {saving ? "Saving..." : customer ? "Save changes" : "Add customer"}
          </Button>
        </div>
      }
    >
      <form
        id="customer-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}
      >
        <FormField id="customer-name" label="NAME" span={12} error={touched ? nameError : null}>
          <Input
            id="customer-name"
            autoFocus
            autoComplete="off"
            placeholder="e.g. Meenakshi Iyer"
            value={name}
            aria-invalid={touched && nameError ? true : undefined}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={enterFrom("customer-name")}
          />
        </FormField>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
          <FormField id="customer-phone" label="PHONE (OPTIONAL)" span={12} error={phoneTaken}>
            <Input
              id="customer-phone"
              type="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              value={phone}
              aria-invalid={phoneTaken ? true : undefined}
              onChange={(event) => {
                setPhone(event.target.value);
                setServerError(null);
              }}
              onKeyDown={enterFrom("customer-phone")}
            />
          </FormField>
          {phoneOwner && onOpenCustomer ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenCustomer(phoneOwner.id)}
              style={{ alignSelf: "flex-start" }}
            >
              Open {phoneOwner.name}&apos;s profile
            </Button>
          ) : null}
        </div>
        <FormField
          id="customer-email"
          label="EMAIL (OPTIONAL)"
          span={12}
          error={touched ? emailError : null}
        >
          <Input
            id="customer-email"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            aria-invalid={touched && emailError ? true : undefined}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={enterFrom("customer-email")}
          />
        </FormField>
        <FormField id="customer-address" label="ADDRESS (OPTIONAL)" span={12}>
          <Input
            id="customer-address"
            autoComplete="off"
            placeholder="e.g. 12 North Street, Mylapore"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={enterFrom("customer-address")}
          />
        </FormField>
        <FormField id="customer-notes" label="NOTES (OPTIONAL)" span={12}>
          <Input
            id="customer-notes"
            autoComplete="off"
            placeholder="e.g. Prefers silk, blouse size 36"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onKeyDown={enterFrom("customer-notes")}
          />
        </FormField>
        {otherError ? (
          <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
            {otherError}
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
