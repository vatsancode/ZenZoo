import { ThemeProvider as TokensThemeProvider } from "@zenzoo/design-tokens";
import type { ReactNode } from "react";
import { useColorScheme } from "react-native";

export interface ThemeProviderProps {
  children: ReactNode;
}

/** Follows the device's light/dark setting via React Native's own hook. */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const scheme = useColorScheme();

  return (
    <TokensThemeProvider theme={scheme === "dark" ? "dark" : "light"}>
      {children}
    </TokensThemeProvider>
  );
}
