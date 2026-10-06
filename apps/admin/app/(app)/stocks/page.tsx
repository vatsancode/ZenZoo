import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import StocksTable from "../../../features/stocks/StocksTable";

export const metadata: Metadata = {
  title: "Stocks - ZenZoo Admin",
};

export default function StocksPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Stocks</h1>
      <StocksTable />
    </main>
  );
}
