import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import PurchaseDetail from "../../../../features/purchases/PurchaseDetail";

export const metadata: Metadata = {
  title: "Purchase - ZenZoo Admin",
};

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: spacing[10] }}>
      <PurchaseDetail purchaseId={decodeURIComponent(id)} />
    </main>
  );
}
