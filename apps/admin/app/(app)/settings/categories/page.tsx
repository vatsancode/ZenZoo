import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import CategoriesSettings from "../../../../components/CategoriesSettings";

export const metadata: Metadata = {
  title: "Categories - ZenZoo Admin",
};

export default function CategoriesSettingsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <CategoriesSettings />
    </main>
  );
}
