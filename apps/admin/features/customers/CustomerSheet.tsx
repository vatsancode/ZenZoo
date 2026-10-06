"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Sheet } from "@zenzoo/ui-web";
import { useEffect, useState, type KeyboardEvent } from "react";
import type { Customer } from "../sales/sales";
import { emailProblem } from "../vendors/vendors";
import FormField from "../../components/FormField";

export interface CustomerInput {
  name: string;
  phone: string;
  email: string;
}

interface CustomerSheetProps {
  open: boolean;
  /** When set, the panel edits this customer instead of adding a new one. */
  customer?: Customer | null;
  onClose: () => void;
  onSubmit: (input: CustomerInput) => void;
}

const ORDER = ["customer-name", "customer-phone", "customer-email"];

/** Adds a customer: just a name is required, so one can be created in a moment at the till. */
export default function CustomerSheet({
  open,
  customer = null,
  onClose,
  onSubmit,
}: CustomerSheetProps) {
  const { spacing } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setName(open && customer ? customer.name : "");
    setPhone(open && customer ? (customer.phone ?? "") : "");
    setEmail(open && customer ? (customer.email ?? "") : "");
    setTouched(false);
  }, [open, customer]);

  const nameError = name.trim() === "" ? "Enter the customer's name." : null;
  const emailError = emailProblem(email);

  function submit() {
    setTouched(true);
    if (nameError || emailError) return;
    onSubmit({ name, phone, email });
  }

  function enterFrom(id: string) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const next = ORDER[ORDER.indexOf(id) + 1];
      if (next) document.getElementById(next)?.focus();
      else submit();
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
          <Button type="submit" form="customer-form" variant="primary" style={{ flex: 2 }}>
            {customer ? "Save changes" : "Add customer"}
          </Button>
        </div>
      }
    >
      <form
        id="customer-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
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
        <FormField id="customer-phone" label="PHONE (OPTIONAL)" span={12}>
          <Input
            id="customer-phone"
            type="tel"
            autoComplete="off"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onKeyDown={enterFrom("customer-phone")}
          />
        </FormField>
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
      </form>
    </Sheet>
  );
}
