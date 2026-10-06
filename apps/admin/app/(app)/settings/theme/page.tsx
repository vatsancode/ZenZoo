import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import ThemeSettings from "../../../../features/settings/ThemeSettings";

export const metadata: Metadata = {
  title: "Theme - ZenZoo Admin",
};

export default function ThemeSettingsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <ThemeSettings />
    </main>
  );
}
