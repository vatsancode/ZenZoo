import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import PurchaseForm from "../../../../features/purchases/PurchaseForm";

export const metadata: Metadata = {
  title: "New purchase - ZenZoo Admin",
};

export default function NewPurchasePage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <PurchaseForm />
    </main>
  );
}
