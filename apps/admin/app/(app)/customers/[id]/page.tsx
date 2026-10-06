import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import CustomerDetail from "../../../../features/customers/CustomerDetail";

export const metadata: Metadata = {
  title: "Customer - ZenZoo Admin",
};

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: spacing[10] }}>
      <CustomerDetail customerId={decodeURIComponent(id)} />
    </main>
  );
}
