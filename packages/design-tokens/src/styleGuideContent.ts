/**
 * Shared, platform-neutral content for the style-guide pages in
 * `apps/admin` and `apps/pos` - which color tokens to group under which
 * heading, the order to show text styles in, and sample copy to render
 * them with. Plain data only, so both apps show the exact same groupings
 * and examples without either one drifting from the other. Not real
 * product data - just enough of a retail flavor to make the samples feel
 * grounded rather than "foo"/"bar".
 */

import type { ColorTokens } from "./colors";
import type { TextStyleName } from "./typography";

export interface ColorGroup {
  title: string;
  keys: (keyof ColorTokens)[];
}

export const colorGroups: ColorGroup[] = [
  {
    title: "Surfaces",
    keys: ["surfaceCanvas", "surfaceRaised", "surfaceSunken", "surfacePlayful"],
  },
  { title: "Text & borders", keys: ["ink", "inkMuted", "inkFaint", "border"] },
  { title: "Accent", keys: ["accent", "accentPressed", "onAccent"] },
  { title: "Playful", keys: ["playful", "onPlayful"] },
  { title: "Status", keys: ["success", "warning", "danger"] },
];

export const textStyleOrder: TextStyleName[] = [
  "display",
  "title1",
  "title2",
  "title3",
  "headline",
  "body",
  "bodyMedium",
  "callout",
  "footnote",
  "caption",
  "data",
  "dataSmall",
];

export const typeSampleLine = "Oat milk, 1L - $4.50";

export const sampleProduct = {
  name: "Oat milk, 1L",
  description: "Dairy-free - chilled",
  sku: "SKU-10234",
  price: "$4.50",
};

export const sampleLineItems = [
  { sku: "SKU-10234", item: "Oat milk, 1L", qty: "2", total: "$9.00" },
  { sku: "SKU-20118", item: "Sourdough loaf", qty: "1", total: "$6.25" },
  { sku: "SKU-30542", item: "Free-range eggs, dozen", qty: "1", total: "$7.80" },
];
