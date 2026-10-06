import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import SettingsHome from "../../../features/settings/SettingsHome";

export const metadata: Metadata = {
  title: "Settings - ZenZoo Admin",
};

export default function SettingsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Settings</h1>
      <SettingsHome />
    </main>
  );
}
