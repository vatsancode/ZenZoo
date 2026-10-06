import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import VendorDetail from "../../../../features/vendors/VendorDetail";

export const metadata: Metadata = {
  title: "Vendor - ZenZoo Admin",
};

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: spacing[10] }}>
      <VendorDetail vendorId={decodeURIComponent(id)} />
    </main>
  );
}
