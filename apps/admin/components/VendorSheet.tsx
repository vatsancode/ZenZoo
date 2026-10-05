"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Sheet } from "@zenzoo/ui-web";
import { useEffect, useState, type KeyboardEvent } from "react";
import { emailProblem, mapUrlProblem, type Vendor, type VendorInput } from "../lib/vendors";
import FormField from "./FormField";

interface VendorSheetProps {
  open: boolean;
  /** When set, the sheet edits this vendor instead of adding a new one. */
  vendor?: Vendor | null;
  onClose: () => void;
  onSubmit: (input: VendorInput) => void;
}

const ORDER = ["vendor-name", "vendor-phone", "vendor-email", "vendor-tax-id", "vendor-map-url"];

export default function VendorSheet({ open, vendor = null, onClose, onSubmit }: VendorSheetProps) {
  const { spacing } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const source = open ? vendor : null;
    setName(source?.name ?? "");
    setPhone(source?.phone ?? "");
    setEmail(source?.email ?? "");
    setTaxId(source?.taxId ?? "");
    setMapUrl(source?.mapUrl ?? "");
    setTouched(false);
  }, [open, vendor]);

  const isEditing = vendor !== null;
  const nameError = name.trim() === "" ? "Enter the vendor name." : null;
  const emailError = emailProblem(email);
  const mapUrlError = mapUrlProblem(mapUrl);
  const valid = !nameError && !emailError && !mapUrlError;

  function submit() {
    setTouched(true);
    if (!valid) return;
    onSubmit({ name, phone, email, taxId, mapUrl });
  }

  // Enter moves to the next field, or submits from the last one.
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
      title={isEditing ? "Edit vendor" : "Add vendor"}
      width={560}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-form" variant="primary" style={{ flex: 2 }}>
            {isEditing ? "Save changes" : "Add vendor"}
          </Button>
        </div>
      }
    >
      <form
        id="vendor-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            columnGap: spacing[3],
            rowGap: spacing[6],
            alignItems: "start",
          }}
        >
          <FormField
            id="vendor-name"
            label="VENDOR NAME"
            span={12}
            error={touched ? nameError : null}
          >
            <Input
              id="vendor-name"
              autoFocus
              autoComplete="off"
              placeholder="e.g. Kumaran Silks"
              value={name}
              aria-invalid={touched && nameError ? true : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={enterFrom("vendor-name")}
            />
          </FormField>
          <FormField id="vendor-phone" label="PHONE (OPTIONAL)" span={6}>
            <Input
              id="vendor-phone"
              type="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              onKeyDown={enterFrom("vendor-phone")}
            />
          </FormField>
          <FormField
            id="vendor-email"
            label="EMAIL (OPTIONAL)"
            span={6}
            error={touched ? emailError : null}
          >
            <Input
              id="vendor-email"
              type="email"
              autoComplete="off"
              placeholder="orders@example.in"
              value={email}
              aria-invalid={touched && emailError ? true : undefined}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={enterFrom("vendor-email")}
            />
          </FormField>
          <FormField id="vendor-tax-id" label="GSTIN (OPTIONAL)" span={12}>
            <Input
              id="vendor-tax-id"
              autoComplete="off"
              placeholder="e.g. 33AABCK1234F1Z5"
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
              onKeyDown={enterFrom("vendor-tax-id")}
            />
          </FormField>
          <FormField
            id="vendor-map-url"
            label="GOOGLE MAPS LINK (OPTIONAL)"
            span={12}
            error={touched ? mapUrlError : null}
          >
            <Input
              id="vendor-map-url"
              type="url"
              autoComplete="off"
              placeholder="https://maps.app.goo.gl/..."
              value={mapUrl}
              aria-invalid={touched && mapUrlError ? true : undefined}
              onChange={(event) => setMapUrl(event.target.value)}
              onKeyDown={enterFrom("vendor-map-url")}
            />
          </FormField>
        </div>
      </form>
    </Sheet>
  );
}
