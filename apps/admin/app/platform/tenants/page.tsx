import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import PlatformSignOutButton from "../../../features/platform/PlatformSignOutButton";
import TenantsTable from "../../../features/platform/TenantsTable";

export const metadata: Metadata = {
  title: "Tenants - ZenZoo Admin",
};

export default function TenantsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: spacing[6],
        }}
      >
        <h1 style={{ ...textStyle("title1") }}>Tenants</h1>
        <PlatformSignOutButton />
      </div>
      <TenantsTable />
    </main>
  );
}
