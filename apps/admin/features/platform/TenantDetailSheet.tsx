"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Sheet, textStyle } from "@zenzoo/ui-web";
import type { Tenant } from "./tenants";

interface TenantDetailSheetProps {
  tenant: Tenant | null;
  onClose: () => void;
}

export default function TenantDetailSheet({ tenant, onClose }: TenantDetailSheetProps) {
  const { colors, spacing } = useTheme();

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
      <span style={{ ...textStyle("caption"), color: colors.inkMuted }}>{label}</span>
      <span style={{ ...textStyle("body"), color: colors.ink }}>{value}</span>
    </div>
  );

  return (
    <Sheet open={tenant !== null} onClose={onClose} title={tenant?.name ?? ""} width={420}>
      {tenant ? (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
          {row(
            "STATUS",
            <Badge tone={tenant.status === "active" ? "success" : "neutral"}>
              {tenant.status}
            </Badge>,
          )}
          {row("SLUG", tenant.slug)}
          {row("OWNER EMAIL", tenant.ownerEmail ?? "-")}
          {row("CREATED", new Date(tenant.createdAt).toLocaleDateString())}
          {row(
            "TENANT ID",
            <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{tenant.id}</span>,
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
