import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import CustomersTable from "../../../components/CustomersTable";

export const metadata: Metadata = {
  title: "Customers - ZenZoo Admin",
};

export default function CustomersPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Customers</h1>
      <CustomersTable />
    </main>
  );
}
