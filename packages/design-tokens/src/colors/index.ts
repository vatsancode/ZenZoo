/**
 * A small, coherent color system: one neutral scale, one brand scale, and a
 * handful of semantic colors - not hundreds of one-off values. Add a shade
 * only when a real component needs it.
 */

export const neutral = {
  0: "#FFFFFF",
  50: "#F7F7F8",
  100: "#EEEEF0",
  200: "#D8D9DD",
  300: "#B6B8BF",
  400: "#8A8D96",
  500: "#63666F",
  600: "#484A52",
  700: "#313339",
  800: "#1E1F24",
  900: "#121317",
  1000: "#000000",
} as const;

export const brand = {
  50: "#EFF6FF",
  100: "#DBEAFE",
  200: "#BFDBFE",
  300: "#93C5FD",
  400: "#60A5FA",
  500: "#3B82F6",
  600: "#2563EB",
  700: "#1D4ED8",
  800: "#1E40AF",
  900: "#1E3A8A",
} as const;

export const semantic = {
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  info: brand[600],
} as const;

/**
 * Role-based aliases components should reach for first. Prefer these over
 * reaching into `neutral`/`brand` directly, so a future palette change is a
 * one-file edit here rather than a search-and-replace across components.
 */
export const colors = {
  background: neutral[0],
  surface: neutral[50],
  border: neutral[200],
  textPrimary: neutral[900],
  textSecondary: neutral[600],
  textInverse: neutral[0],
  primary: brand[600],
  primaryHover: brand[700],
  primaryPressed: brand[800],
  ...semantic,
  neutral,
  brand,
} as const;

export type Colors = typeof colors;
