import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import DashboardScreen from "../../components/DashboardScreen";

export const metadata: Metadata = {
  title: "Dashboard - ZenZoo Admin",
};

export default function HomePage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <DashboardScreen />
    </main>
  );
}
