import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import AccountsSettings from "../../../../features/settings/AccountsSettings";

export const metadata: Metadata = {
  title: "Accounts - ZenZoo Admin",
};

export default function AccountsSettingsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <AccountsSettings />
    </main>
  );
}
