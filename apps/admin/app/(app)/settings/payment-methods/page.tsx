import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import PaymentMethodsSettings from "../../../../features/settings/PaymentMethodsSettings";

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
