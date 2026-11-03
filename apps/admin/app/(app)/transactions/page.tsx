import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import TransactionsTable from "../../../features/transactions/TransactionsTable";

export const metadata: Metadata = {
  title: "Transactions - ZenZoo Admin",
};

export default function TransactionsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Transactions</h1>
      <TransactionsTable />
    </main>
  );
}
