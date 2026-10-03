/**
 * Color roles, defined once per theme. Components should always read these
 * through `useTheme()` rather than importing `lightColors`/`darkColors`
 * directly, so a screen follows the viewer's light/dark preference instead
 * of being pinned to one theme.
 */

export type ThemeName = "light" | "dark";

export interface ColorTokens {
  /** App background, behind every screen. */
  surfaceCanvas: string;
  /** Cards, sheets, modals, menus - anything sitting above the canvas. */
  surfaceRaised: string;
  /** Inputs, selects, chips - controls recessed into a surface. */
  surfaceSunken: string;
  /** Soft wash behind empty states, onboarding and callouts. Used sparingly. */
  surfacePlayful: string;
  /** Hairline dividers and resting input outlines. Pair with elevation, not both. */
  border: string;
  /** Primary text and icons. */
  ink: string;
  /** Secondary text and metadata. */
  inkMuted: string;
  /** Placeholder text and disabled labels only - never body copy. */
  inkFaint: string;
  /** Primary action: filled buttons, links, the active state of a control. */
  accent: string;
  /** `accent` while pressed or active. */
  accentPressed: string;
  /** Text and icons on an `accent` or `accentPressed` fill. */
  onAccent: string;
  /** The one warm accent: celebrations, highlighted tips, illustration fills. */
  playful: string;
  /** Text and icons on a `playful` fill. */
  onPlayful: string;
  /** Status: stock levels, confirmations. */
  success: string;
  /** Status: form errors, caution states. */
  warning: string;
  /** Status: destructive actions, failures. */
  danger: string;
}

export const lightColors: ColorTokens = {
  surfaceCanvas: "#fafafc",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f2f2f6",
  surfacePlayful: "#f1eeff",
  border: "#e3e3e8",
  ink: "#1c1c1e",
  inkMuted: "#6e6e73",
  inkFaint: "#aeaeb2",
  accent: "#0f66e0",
  accentPressed: "#0b4fb0",
  onAccent: "#ffffff",
  playful: "#ff7a47",
  onPlayful: "#1c1c1e",
  success: "#198754",
  warning: "#9c5700",
  danger: "#c62828",
};

export const darkColors: ColorTokens = {
  surfaceCanvas: "#000000",
  surfaceRaised: "#1c1c1e",
  surfaceSunken: "#2c2c2e",
  surfacePlayful: "#241f33",
  border: "#3a3a3c",
  ink: "#f5f5f7",
  inkMuted: "#98989d",
  inkFaint: "#68686d",
  // Brighter than the light-theme accent for the same visual weight against
  // black; pairs with onAccent flipping to dark text below.
  accent: "#3d9bff",
  accentPressed: "#2b86ff",
  onAccent: "#1c1c1e",
  playful: "#ff8f66",
  onPlayful: "#1c1c1e",
  success: "#3ddc84",
  warning: "#ffc35c",
  danger: "#ff6b6b",
};

export const colorThemes: Record<ThemeName, ColorTokens> = {
  light: lightColors,
  dark: darkColors,
};
