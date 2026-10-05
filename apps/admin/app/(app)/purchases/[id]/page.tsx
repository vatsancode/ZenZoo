import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import PurchaseDetail from "../../../../components/PurchaseDetail";

export const metadata: Metadata = {
  title: "Purchase - ZenZoo Admin",
};

export default async function PurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return (
    <main style={{ padding: spacing[10] }}>
      <PurchaseDetail purchaseId={decodeURIComponent(id)} initialTab={tab} />
    </main>
  );
}
