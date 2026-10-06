import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import AuditLog from "../../../../features/settings/AuditLog";

export const metadata: Metadata = {
  title: "Audit log - ZenZoo Admin",
};

export default function AuditLogPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <AuditLog />
    </main>
  );
}
