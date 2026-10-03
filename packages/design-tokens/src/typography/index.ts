/**
 * Font tokens. `fontFamily` intentionally names platform-default stacks
 * rather than a licensed webfont - swap it here once a real typeface is
 * chosen, without touching any component.
 */

export const fontFamily = {
  base: "System",
  mono: "SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} as const;

export type Typography = typeof typography;
