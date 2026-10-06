import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import PurchaseForm from "../../../../../features/purchases/PurchaseForm";

export const metadata: Metadata = {
  title: "Edit purchase - ZenZoo Admin",
};

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: spacing[10] }}>
      <PurchaseForm purchaseId={decodeURIComponent(id)} />
    </main>
  );
}
