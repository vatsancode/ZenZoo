"use client";

import { ThemeProvider as TokensThemeProvider, type ThemeName } from "@zenzoo/design-tokens";
import { useEffect, useState, type ReactNode } from "react";

export interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Resolves the viewer's system light/dark preference and keeps it current,
 * then provides it through `@zenzoo/design-tokens`' theme context. Starts
 * from "light" on the server (where `window` doesn't exist) and corrects
 * itself on mount - a brief flash on a dark-preferring browser is an
 * accepted simplification until the product actually needs a no-flash
 * boot script.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setTheme(query.matches ? "dark" : "light");

    const listener = (event: MediaQueryListEvent) => setTheme(event.matches ? "dark" : "light");
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return <TokensThemeProvider theme={theme}>{children}</TokensThemeProvider>;
}
