"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Sheet, textStyle } from "@zenzoo/ui-web";
import { useState, type FormEvent } from "react";
import FormField from "../../components/FormField";
import { redirectToSignInIfUnauthorized } from "../../lib/auth";
import { slugify, suggestStoreCode } from "../../lib/slug";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface FormState {
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPassword: string;
  tenantName: string;
  storeName: string;
  storeCode: string;
}

const EMPTY_FORM: FormState = {
  ownerFirstName: "",
  ownerLastName: "",
  ownerEmail: "",
  ownerPassword: "",
  tenantName: "",
  storeName: "",
  storeCode: "",
};

const OWNER_FIELDS: { key: keyof FormState; label: string; type?: string }[] = [
  { key: "ownerFirstName", label: "OWNER FIRST NAME" },
  { key: "ownerLastName", label: "OWNER LAST NAME" },
  { key: "ownerEmail", label: "OWNER EMAIL", type: "email" },
  { key: "ownerPassword", label: "OWNER PASSWORD", type: "password" },
];

interface CreateTenantSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after the tenant is created, so the list can refresh. */
  onCreated: () => void;
}

export default function CreateTenantSheet({ open, onClose, onCreated }: CreateTenantSheetProps) {
  const { spacing, colors } = useTheme();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Once the admin edits the store code by hand, stop overwriting it as the store name changes.
  const [storeCodeEdited, setStoreCodeEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantSlug = slugify(form.tenantName);
  const canSubmit =
    tenantSlug.length > 0 &&
    Object.values(form).every((value) => value.trim().length > 0) &&
    !loading;

  function reset() {
    setForm(EMPTY_FORM);
    setStoreCodeEdited(false);
    setError(null);
  }

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleStoreNameChange(value: string) {
    setForm((prev) => ({
      ...prev,
      storeName: value,
      storeCode: storeCodeEdited ? prev.storeCode : suggestStoreCode(value),
    }));
  }

  function handleStoreCodeChange(value: string) {
    setStoreCodeEdited(true);
    // The `stores` table requires a lowercase code (stores_code_lowercase_check).
    setField("storeCode", value.toLowerCase());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/platform-admin/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, tenantSlug }),
      });
      const data = (await response.json()) as { tenantId?: string; error?: string };
      if (!response.ok) {
        redirectToSignInIfUnauthorized(response);
        setError(data.error ?? "Couldn't create the tenant.");
        return;
      }
      reset();
      onCreated();
      onClose();
    } catch {
      setError("Couldn't reach the server. Is it running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create a tenant"
      width={480}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-tenant-form"
            variant="primary"
            disabled={!canSubmit}
            style={{ flex: 2 }}
          >
            {loading ? "Creating..." : "Create tenant"}
          </Button>
        </div>
      }
    >
      <p style={{ ...textStyle("callout"), color: colors.inkMuted, marginBottom: spacing[6] }}>
        Creates a new tenant, its main store, and its owner account, all at once.
      </p>

      <form
        id="create-tenant-form"
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}
      >
        <FormField id="create-tenant-name" label="TENANT NAME" span={12}>
          <Input
            id="create-tenant-name"
            autoFocus
            value={form.tenantName}
            onChange={(event) => setField("tenantName", event.target.value)}
            disabled={loading}
          />
          {tenantSlug ? (
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
              URL slug: {tenantSlug}
            </span>
          ) : null}
        </FormField>

        <FormField id="create-tenant-store-name" label="MAIN STORE NAME" span={12}>
          <Input
            id="create-tenant-store-name"
            value={form.storeName}
            onChange={(event) => handleStoreNameChange(event.target.value)}
            disabled={loading}
          />
        </FormField>

        <FormField id="create-tenant-store-code" label="STORE CODE" span={12}>
          <Input
            id="create-tenant-store-code"
            value={form.storeCode}
            onChange={(event) => handleStoreCodeChange(event.target.value)}
            disabled={loading}
          />
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            Suggested from the store name - edit it if you'd like a different one.
          </span>
        </FormField>

        {OWNER_FIELDS.map(({ key, label, type }) => (
          <FormField key={key} id={`create-tenant-${key}`} label={label} span={12}>
            <Input
              id={`create-tenant-${key}`}
              type={type ?? "text"}
              value={form[key]}
              onChange={(event) => setField(key, event.target.value)}
              disabled={loading}
            />
          </FormField>
        ))}

        {error ? (
          <div style={{ ...textStyle("callout"), color: colors.danger }} role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
