"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState, type KeyboardEvent } from "react";
import {
  emailProblem,
  mapUrlProblem,
  phoneProblem,
  type Vendor,
  type VendorInput,
} from "./vendors";
import FormField from "../../components/FormField";
import { useSingleFlight } from "../../lib/useSingleFlight";

interface VendorSheetProps {
  open: boolean;
  /** When set, the sheet edits this vendor instead of adding a new one. */
  vendor?: Vendor | null;
  /** The vendors already saved, to warn about a repeated name and catch a repeated GSTIN early. */
  existing?: Vendor[];
  onClose: () => void;
  /** Saves the vendor; resolves to an error message to show, or null when it went through. */
  onSubmit: (input: VendorInput) => Promise<string | null>;
}

const ORDER = ["vendor-name", "vendor-phone", "vendor-email", "vendor-tax-id", "vendor-map-url"];

export default function VendorSheet({
  open,
  vendor = null,
  existing = [],
  onClose,
  onSubmit,
}: VendorSheetProps) {
  const { colors, spacing } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { busy: saving, run: runSave } = useSingleFlight();

  useEffect(() => {
    const source = open ? vendor : null;
    setName(source?.name ?? "");
    setPhone(source?.phone ?? "");
    setEmail(source?.email ?? "");
    setTaxId(source?.taxId ?? "");
    setMapUrl(source?.mapUrl ?? "");
    setTouched(false);
    setSubmitError(null);
  }, [open, vendor]);

  const isEditing = vendor !== null;
  const others = existing.filter((item) => item.id !== vendor?.id);
  // The same name is allowed (two branches of one supplier), but worth a second look.
  const sameName = others.find(
    (item) => item.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const nameHint = sameName
    ? `${sameName.name} already exists${sameName.status === "archived" ? " (archived)" : ""}. You can still save this one.`
    : null;
  // A GSTIN belongs to one business, so a repeat is refused - the server refuses it too.
  const typedTaxId = taxId.trim().toUpperCase();
  const sameTaxId = typedTaxId ? others.find((item) => item.taxId === typedTaxId) : undefined;
  const taxIdError = sameTaxId ? `${sameTaxId.name} already has this GSTIN.` : null;
  const nameError = name.trim() === "" ? "Enter the vendor name." : null;
  const phoneError = phoneProblem(phone);
  const emailError = emailProblem(email);
  const mapUrlError = mapUrlProblem(mapUrl);
  const valid = !nameError && !phoneError && !emailError && !mapUrlError && !taxIdError;

  function submit() {
    setTouched(true);
    if (!valid) return;
    return runSave(async () => {
      setSubmitError(await onSubmit({ name, phone, email, taxId, mapUrl }));
    });
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
          <Button
            type="submit"
            form="vendor-form"
            variant="primary"
            loading={saving}
            style={{ flex: 2 }}
          >
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
            hint={nameHint}
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
          <FormField
            id="vendor-phone"
            label="PHONE (OPTIONAL)"
            span={6}
            error={touched ? phoneError : null}
          >
            <Input
              id="vendor-phone"
              type="tel"
              autoComplete="off"
              maxLength={20}
              placeholder="+91 98765 43210"
              value={phone}
              aria-invalid={touched && phoneError ? true : undefined}
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
          <FormField id="vendor-tax-id" label="GSTIN (OPTIONAL)" span={12} error={taxIdError}>
            <Input
              id="vendor-tax-id"
              autoComplete="off"
              placeholder="e.g. 33AABCK1234F1Z5"
              value={taxId}
              aria-invalid={taxIdError ? true : undefined}
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
          {submitError ? (
            <div
              style={{ gridColumn: "span 12", ...textStyle("callout"), color: colors.danger }}
              role="alert"
            >
              {submitError}
            </div>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}
