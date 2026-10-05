import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import ExpenseCategoriesSettings from "../../../../components/ExpenseCategoriesSettings";

export const metadata: Metadata = {
  title: "Expense categories - ZenZoo Admin",
};

export default function ExpenseCategoriesPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <ExpenseCategoriesSettings />
    </main>
  );
}
