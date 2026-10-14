"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Input, Sheet, textStyle } from "@zenzoo/ui-web";
import { useState } from "react";
import FormField from "../../components/FormField";
import { resetTenantOwnerPassword, updateTenantOwnerEmail, type Tenant } from "./tenants";

type Panel = "none" | "password" | "email";

interface TenantDetailSheetProps {
  tenant: Tenant | null;
  onClose: () => void;
  /** Called after the owner's email is changed, so the list can refresh. */
  onUpdated: () => void;
}

export default function TenantDetailSheet({ tenant, onClose, onUpdated }: TenantDetailSheetProps) {
  const { colors, spacing } = useTheme();
  const [panel, setPanel] = useState<Panel>("none");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [savedOwnerEmail, setSavedOwnerEmail] = useState<string | null>(null);

  function closePanel() {
    setPanel("none");
    setNewPassword("");
    setNewEmail("");
    setError(null);
    setSuccess(false);
  }

  function handleClose() {
    closePanel();
    setSavedOwnerEmail(null);
    onClose();
  }

  function openPanel(next: Panel) {
    closePanel();
    setPanel(next);
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    if (!tenant || !newPassword.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await resetTenantOwnerPassword(tenant.id, newPassword);
      setSuccess(true);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!tenant || !newEmail.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const savedEmail = await updateTenantOwnerEmail(tenant.id, newEmail);
      setSavedOwnerEmail(savedEmail);
      setSuccess(true);
      setNewEmail("");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the email.");
    } finally {
      setLoading(false);
    }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
      <span style={{ ...textStyle("caption"), color: colors.inkMuted }}>{label}</span>
      <span style={{ ...textStyle("body"), color: colors.ink }}>{value}</span>
    </div>
  );

  return (
    <Sheet open={tenant !== null} onClose={handleClose} title={tenant?.name ?? ""} width={420}>
      {tenant ? (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
          {row(
            "STATUS",
            <Badge tone={tenant.status === "active" ? "success" : "neutral"}>
              {tenant.status}
            </Badge>,
          )}
          {row("SLUG", tenant.slug)}
          {row("OWNER EMAIL", savedOwnerEmail ?? tenant.ownerEmail ?? "-")}
          {row("CREATED", new Date(tenant.createdAt).toLocaleDateString())}
          {row(
            "TENANT ID",
            <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{tenant.id}</span>,
          )}

          <div
            style={{
              borderTop: `1px solid ${colors.border}`,
              paddingTop: spacing[5],
              display: "flex",
              flexDirection: "column",
              gap: spacing[3],
            }}
          >
            {panel === "none" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!tenant.ownerEmail}
                  onClick={() => openPanel("email")}
                  style={{ whiteSpace: "nowrap" }}
                >
                  Change owner email
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!tenant.ownerEmail}
                  onClick={() => openPanel("password")}
                  style={{ whiteSpace: "nowrap" }}
                >
                  Reset password
                </Button>
              </div>
            ) : panel === "password" ? (
              <form
                onSubmit={handleReset}
                style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}
              >
                <FormField id="reset-owner-password" label="NEW PASSWORD FOR OWNER" span={12}>
                  <Input
                    id="reset-owner-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    disabled={loading || success}
                    autoFocus
                  />
                </FormField>
                {error ? (
                  <div style={{ ...textStyle("callout"), color: colors.danger }} role="alert">
                    {error}
                  </div>
                ) : null}
                {success ? (
                  <div style={{ ...textStyle("callout"), color: colors.success }}>
                    Password reset. Share it with the owner directly.
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: spacing[3] }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closePanel}
                    style={{ flex: 1, whiteSpace: "nowrap" }}
                  >
                    {success ? "Done" : "Cancel"}
                  </Button>
                  {!success ? (
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!newPassword.trim() || loading}
                      style={{ flex: 2, whiteSpace: "nowrap" }}
                    >
                      {loading ? "Resetting..." : "Reset password"}
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleEmailUpdate}
                style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}
              >
                <FormField id="update-owner-email" label="NEW EMAIL FOR OWNER" span={12}>
                  <Input
                    id="update-owner-email"
                    type="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    disabled={loading || success}
                    autoFocus
                  />
                </FormField>
                {error ? (
                  <div style={{ ...textStyle("callout"), color: colors.danger }} role="alert">
                    {error}
                  </div>
                ) : null}
                {success ? (
                  <div style={{ ...textStyle("callout"), color: colors.success }}>
                    Email updated. The owner signs in with the new address from now on.
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: spacing[3] }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closePanel}
                    style={{ flex: 1, whiteSpace: "nowrap" }}
                  >
                    {success ? "Done" : "Cancel"}
                  </Button>
                  {!success ? (
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!newEmail.trim() || loading}
                      style={{ flex: 2, whiteSpace: "nowrap" }}
                    >
                      {loading ? "Saving..." : "Save email"}
                    </Button>
                  ) : null}
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
