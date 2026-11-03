import { spacing } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { Metadata } from "next";
import SlotsBoard from "../../../features/slots/SlotsBoard";

export const metadata: Metadata = {
  title: "Slot management - ZenZoo Admin",
};

export default function SlotsPage() {
  return (
    <main style={{ padding: spacing[10] }}>
      <h1 style={{ ...textStyle("title1"), marginBottom: spacing[6] }}>Slot management</h1>
      <SlotsBoard />
    </main>
  );
}
