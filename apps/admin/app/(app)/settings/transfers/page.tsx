import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import TransfersSettings from "../../../../features/settings/TransfersSettings";

export const metadata: Metadata = {
  title: "Transfer - ZenZoo Admin",
};

export default function TransfersSettingsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <TransfersSettings />
    </main>
  );
}
