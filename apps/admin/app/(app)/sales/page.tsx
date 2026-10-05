import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import SalesTable from "../../../components/SalesTable";

export const metadata: Metadata = {
  title: "Sales - ZenZoo Admin",
};

export default function SalesPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Sales</h1>
      <SalesTable />
    </main>
  );
}
