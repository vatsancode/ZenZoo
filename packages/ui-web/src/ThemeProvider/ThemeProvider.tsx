"use client";

import { ThemeProvider as TokensThemeProvider, type ThemeName } from "@zenzoo/design-tokens";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface ThemeProviderProps {
  children: ReactNode;
}

/** What the person chose: follow the device, or always light, or always dark. */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "zenzoo-theme";

interface PreferenceContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const PreferenceContext = createContext<PreferenceContextValue>({
  preference: "system",
  setPreference: () => {},
});

/** Reads and changes the theme preference, for a settings screen. */
export function useThemePreference(): PreferenceContextValue {
  return useContext(PreferenceContext);
}

/**
 * Resolves the theme and provides it through `@zenzoo/design-tokens`' theme
 * context. By default it follows the viewer's system light/dark preference and
 * keeps it current; a saved choice of light or dark overrides that. Starts from
 * "light" on the server (where `window` doesn't exist) and corrects itself on
 * mount - a brief flash on a dark-preferring browser is an accepted
 * simplification until the product actually needs a no-flash boot script.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [system, setSystem] = useState<ThemeName>("light");
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setSystem(query.matches ? "dark" : "light");

    const listener = (event: MediaQueryListEvent) => setSystem(event.matches ? "dark" : "light");
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  // Storage can be blocked or empty (private windows, cleared data), so every access is guarded.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") setPreferenceState(saved);
    } catch {
      // keep following the system
    }
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // the choice still applies for this visit
    }
  }

  const theme: ThemeName = preference === "system" ? system : preference;

  return (
    <PreferenceContext.Provider value={{ preference, setPreference }}>
      <TokensThemeProvider theme={theme}>{children}</TokensThemeProvider>
    </PreferenceContext.Provider>
  );
}
