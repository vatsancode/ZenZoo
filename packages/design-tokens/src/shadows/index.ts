/**
 * Web (box-shadow) and native (shadow* / elevation) use genuinely different
 * APIs, so each elevation level carries both representations rather than
 * forcing one shape onto both platforms. Shadows are also theme-aware: a
 * dark surface needs a stronger, higher-opacity shadow than a light one to
 * read as the same lift. Soft and shallow by design - reach for the next
 * step up rather than increasing an existing shadow's opacity, and never
 * pair a shadow with a border on the same edge.
 */

import type { ThemeName } from "../colors";

export interface NativeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface ElevationLevel {
  web: string;
  native: NativeShadow;
}

export type ElevationName = "xs" | "sm" | "md" | "lg";

const lightElevation: Record<ElevationName, ElevationLevel> = {
  xs: {
    web: "0 1px 2px rgba(28, 28, 30, 0.04)",
    native: {
      shadowColor: "#1c1c1e",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
  },
  sm: {
    web: "0 2px 8px rgba(28, 28, 30, 0.06)",
    native: {
      shadowColor: "#1c1c1e",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
  },
  md: {
    web: "0 8px 24px rgba(28, 28, 30, 0.10)",
    native: {
      shadowColor: "#1c1c1e",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 6,
    },
  },
  lg: {
    web: "0 24px 48px rgba(28, 28, 30, 0.16)",
    native: {
      shadowColor: "#1c1c1e",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 32,
      elevation: 12,
    },
  },
};

const darkElevation: Record<ElevationName, ElevationLevel> = {
  xs: {
    web: "0 1px 2px rgba(0, 0, 0, 0.5)",
    native: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.5,
      shadowRadius: 2,
      elevation: 1,
    },
  },
  sm: {
    web: "0 2px 8px rgba(0, 0, 0, 0.55)",
    native: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.55,
      shadowRadius: 8,
      elevation: 2,
    },
  },
  md: {
    web: "0 8px 24px rgba(0, 0, 0, 0.6)",
    native: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.6,
      shadowRadius: 16,
      elevation: 6,
    },
  },
  lg: {
    web: "0 24px 48px rgba(0, 0, 0, 0.7)",
    native: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.7,
      shadowRadius: 32,
      elevation: 12,
    },
  },
};

export const elevationThemes: Record<ThemeName, Record<ElevationName, ElevationLevel>> = {
  light: lightElevation,
  dark: darkElevation,
};
