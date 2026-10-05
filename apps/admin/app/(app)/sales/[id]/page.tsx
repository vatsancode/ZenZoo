import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import SaleDetail from "../../../../components/SaleDetail";

export const metadata: Metadata = {
  title: "Sale - ZenZoo Admin",
};

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: spacing[10] }}>
      <SaleDetail saleId={decodeURIComponent(id)} />
    </main>
  );
}
