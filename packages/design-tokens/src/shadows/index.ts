/**
 * Web (box-shadow) and native (shadow* / elevation) use genuinely different
 * APIs, so each elevation level carries both representations rather than
 * forcing one shape onto both platforms. `ui-web` reads `.web`, `ui-native`
 * reads `.native` - the *meaning* of "elevation 2" stays the same platform
 * to platform, only its expression differs.
 */

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

export const elevation: Record<"none" | "sm" | "md" | "lg", ElevationLevel> = {
  none: {
    web: "none",
    native: {
      shadowColor: "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
  sm: {
    web: "0 1px 2px rgba(18, 19, 23, 0.08)",
    native: {
      shadowColor: "#121317",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 1,
    },
  },
  md: {
    web: "0 4px 8px rgba(18, 19, 23, 0.12)",
    native: {
      shadowColor: "#121317",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
  },
  lg: {
    web: "0 8px 24px rgba(18, 19, 23, 0.16)",
    native: {
      shadowColor: "#121317",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 8,
    },
  },
};

export type Elevation = typeof elevation;
