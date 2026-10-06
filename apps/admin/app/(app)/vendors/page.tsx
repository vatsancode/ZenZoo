import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import VendorsTable from "../../../features/vendors/VendorsTable";

export const metadata: Metadata = {
  title: "Vendors - ZenZoo Admin",
};

export default function VendorsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Vendors</h1>
      <VendorsTable />
    </main>
  );
}
