"use client";

import { typography, useTheme } from "@zenzoo/design-tokens";
import { useEffect, type ReactNode } from "react";

/**
 * Applies the resolved theme's canvas color and the loaded font to
 * `<body>`. A side effect rather than inline styles on the server-rendered
 * layout, since the theme itself only resolves after mount (see
 * `ThemeProvider`'s own note on the light/dark flash trade-off).
 */
export function ThemedBody({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  useEffect(() => {
    document.body.style.backgroundColor = colors.surfaceCanvas;
    document.body.style.color = colors.ink;
    document.body.style.fontFamily = typography.fontFamily.sans;
  }, [colors]);

  return <>{children}</>;
}
