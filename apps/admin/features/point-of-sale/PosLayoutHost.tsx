"use client";

import { useLayout } from "../../lib/layouts";
import PosScreen from "./PosScreen";
import PosScreenLayout2 from "./PosScreenLayout2";

/** Shows the Point of Sale in the layout chosen under Settings > Layout. */
export default function PosLayoutHost() {
  const [layout] = useLayout("pos");
  return layout === "layout-2" ? <PosScreenLayout2 /> : <PosScreen />;
}
