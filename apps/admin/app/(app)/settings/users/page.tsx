import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import UsersSettings from "../../../../features/settings/UsersSettings";

export const metadata: Metadata = {
  title: "Users and roles - ZenZoo Admin",
};

export default function UsersPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <UsersSettings />
    </main>
  );
}
