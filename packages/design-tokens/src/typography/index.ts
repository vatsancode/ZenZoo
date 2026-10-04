/**
 * One typeface, used at every weight instead of pairing a second display
 * face. `fontFamily` holds the web CSS stacks; React Native can't resolve a
 * CSS stack, so `ui-native` loads the same Manrope/JetBrains Mono weights
 * via `expo-font` and maps each `textStyles` entry to the matching loaded
 * font name itself, rather than this package reaching into a
 * platform-specific font loader.
 */

/**
 * Web reads these through CSS custom properties rather than naming "Manrope"
 * literally: Next's font optimizer (`next/font/google`) self-hosts the font
 * under a generated name and exposes it only via the variable it's given -
 * see apps/admin's root layout, which defines `--font-sans`/`--font-mono`.
 * The chain after each variable is the fallback if that variable is ever
 * unset (e.g. a story or test that renders `ui-web` outside the app shell).
 */
export const fontFamily = {
  sans: "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "var(--font-mono), 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export interface TextStyle {
  fontFamily: "sans" | "mono";
  fontSize: number;
  lineHeight: number;
  fontWeight: keyof typeof fontWeight;
  /** 0 means "no tracking adjustment", kept explicit rather than optional so every style has the same shape. */
  letterSpacing: number;
}

/**
 * Ten steps on `sans`, two on `mono` for anywhere digits line up in a
 * column (totals, quantities, SKUs). Usage notes live with each style so a
 * consumer doesn't have to guess which one fits.
 */
export const textStyles = {
  /** Hero numbers and empty-state headlines. One per screen, at most. */
  display: {
    fontFamily: "sans",
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "bold",
    letterSpacing: -0.34,
  },
  /** Screen titles. */
  title1: {
    fontFamily: "sans",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "bold",
    letterSpacing: -0.28,
  },
  /** Section headers within a screen. */
  title2: {
    fontFamily: "sans",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "semibold",
    letterSpacing: 0,
  },
  /** Card and list-section headers. */
  title3: {
    fontFamily: "sans",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "semibold",
    letterSpacing: 0,
  },
  /** Emphasized single lines - list titles, button labels, dialog headings. */
  headline: {
    fontFamily: "sans",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "semibold",
    letterSpacing: 0,
  },
  /** Default reading text. */
  body: {
    fontFamily: "sans",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "regular",
    letterSpacing: 0,
  },
  /** Body text that needs a touch more weight without stepping up a size. */
  bodyMedium: {
    fontFamily: "sans",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "medium",
    letterSpacing: 0,
  },
  /** Secondary paragraphs, helper text, card descriptions. */
  callout: {
    fontFamily: "sans",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "regular",
    letterSpacing: 0,
  },
  /** Fine print, timestamps, field hints. */
  footnote: {
    fontFamily: "sans",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "regular",
    letterSpacing: 0,
  },
  /** Short, uppercase labels above a section or field - never a sentence. */
  caption: {
    fontFamily: "sans",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "semibold",
    letterSpacing: 0.48,
  },
  /** Prices, totals and quantities in line items and receipts. */
  data: {
    fontFamily: "mono",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "medium",
    letterSpacing: 0,
  },
  /** SKUs, barcodes and secondary numeric metadata. */
  dataSmall: {
    fontFamily: "mono",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "medium",
    letterSpacing: 0,
  },
} satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;

export const typography = {
  fontFamily,
  fontWeight,
  textStyles,
} as const;

export type Typography = typeof typography;
