"use client";

/**
 * A theme bundles one color palette with the rest of the system (spacing,
 * radius and typography stay the same across themes; elevation does not).
 * `ThemeProvider` is deliberately dumb: it takes an already-resolved
 * `ThemeName` and provides the matching bundle, with no system-preference
 * detection of its own, because that detection is platform-specific
 * (`window.matchMedia` on web, `useColorScheme()` on React Native). Each
 * app's root resolves the preference and passes it in - see `@zenzoo/ui-web`
 * and `@zenzoo/ui-native` for the platform-specific wrapper each one uses.
 */

import { createContext, createElement, useContext, type ReactNode } from "react";
import { colorThemes, type ColorTokens, type ThemeName } from "./colors";
import { elevationThemes, type ElevationLevel, type ElevationName } from "./shadows";
import { radius } from "./radius";
import { spacing } from "./spacing";
import { typography } from "./typography";

export interface Theme {
  name: ThemeName;
  colors: ColorTokens;
  elevation: Record<ElevationName, ElevationLevel>;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

function buildTheme(name: ThemeName): Theme {
  return {
    name,
    colors: colorThemes[name],
    elevation: elevationThemes[name],
    spacing,
    radius,
    typography,
  };
}

export const lightTheme: Theme = buildTheme("light");
export const darkTheme: Theme = buildTheme("dark");

export const themes: Record<ThemeName, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};

export const ThemeContext = createContext<Theme>(lightTheme);

export interface ThemeProviderProps {
  theme: ThemeName;
  children: ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  return createElement(ThemeContext.Provider, { value: themes[theme] }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
