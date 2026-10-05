import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import PaymentMethodsSettings from "../../../../components/PaymentMethodsSettings";

export const metadata: Metadata = {
  title: "Payment methods - ZenZoo Admin",
};

export default function PaymentMethodsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <PaymentMethodsSettings />
    </main>
  );
}
