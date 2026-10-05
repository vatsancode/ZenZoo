import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import ExpensesTable from "../../../components/ExpensesTable";

export const metadata: Metadata = {
  title: "Expenses - ZenZoo Admin",
};

export default function ExpensesPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Expenses</h1>
      <ExpensesTable />
    </main>
  );
}
