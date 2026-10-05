import { spacing } from "@zenzoo/design-tokens";
import type { Metadata } from "next";
import PosScreen from "../../../components/PosScreen";

export const metadata: Metadata = {
  title: "Point of Sale - ZenZoo Admin",
};

export default function PointOfSalePage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <PosScreen />
    </main>
  );
}
