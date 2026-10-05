import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import VariantsTable from "../../../../../components/VariantsTable";

export const metadata: Metadata = {
  title: "Variants - ZenZoo Admin",
};

export default async function VariantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: spacing[10] }}>
      <VariantsTable productId={decodeURIComponent(id)} />
    </main>
  );
}
