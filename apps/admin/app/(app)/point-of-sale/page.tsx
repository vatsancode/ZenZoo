import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import PosLayoutHost from "../../../features/point-of-sale/PosLayoutHost";

export const metadata: Metadata = {
  title: "Point of Sale - ZenZoo Admin",
};

export default function PointOfSalePage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <PosLayoutHost />
    </main>
  );
}
