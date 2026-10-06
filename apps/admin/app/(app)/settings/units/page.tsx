import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import UnitsSettings from "../../../../features/settings/UnitsSettings";

export const metadata: Metadata = {
  title: "Units - ZenZoo Admin",
};

export default function UnitsSettingsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <UnitsSettings />
    </main>
  );
}
