import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import AiConnectorsSettings from "../../../../features/settings/AiConnectorsSettings";

export const metadata: Metadata = {
  title: "AI connectors - ZenZoo Admin",
};

export default function AiConnectorsSettingsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <AiConnectorsSettings />
    </main>
  );
}
