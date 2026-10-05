import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import CatalogueTable from "../../../components/CatalogueTable";

export const metadata: Metadata = {
  title: "Catalogue - ZenZoo Admin",
};

export default function CataloguePage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Catalogue</h1>
      <CatalogueTable />
    </main>
  );
}
