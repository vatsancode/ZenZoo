import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import CurrentStockView from "../../../../../features/stocks/CurrentStockView";

export const metadata: Metadata = {
  title: "Current stock - ZenZoo Admin",
};

export default async function CurrentStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  return (
    <main style={{ padding: spacing[10] }}>
      <CurrentStockView productId={decodeURIComponent(id)} variantId={variant} />
    </main>
  );
}
