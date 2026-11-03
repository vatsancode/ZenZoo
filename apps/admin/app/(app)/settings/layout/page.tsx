import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import LayoutSettings from "../../../../features/settings/LayoutSettings";

export const metadata: Metadata = {
  title: "Layout - ZenZoo Admin",
};

export default function LayoutSettingsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <LayoutSettings />
    </main>
  );
}
