import { textStyles, type TextStyleName } from "@zenzoo/design-tokens";
import type { TextStyle } from "react-native";

/**
 * React Native can't resolve a CSS font stack, so each weight needs the
 * exact PostScript name Expo's Google Fonts package registers. The app
 * (`apps/pos`) is responsible for loading these via `useFonts()` before
 * rendering; see its root layout.
 */
const manropeByWeight: Record<string, string> = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

const jetBrainsMonoByWeight: Record<string, string> = {
  regular: "JetBrainsMono_400Regular",
  medium: "JetBrainsMono_500Medium",
  semibold: "JetBrainsMono_600SemiBold",
  bold: "JetBrainsMono_700Bold",
};

export function textStyle(name: TextStyleName): TextStyle {
  const style = textStyles[name];
  const fontFamily =
    style.fontFamily === "mono"
      ? jetBrainsMonoByWeight[style.fontWeight]
      : manropeByWeight[style.fontWeight];

  return {
    fontFamily,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  };
}
