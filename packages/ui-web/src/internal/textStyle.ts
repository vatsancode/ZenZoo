import { typography, type TextStyleName } from "@zenzoo/design-tokens";
import type { CSSProperties } from "react";

/** Turns a named text style into the CSS properties that render it. */
export function textStyle(name: TextStyleName): CSSProperties {
  const style = typography.textStyles[name];
  return {
    fontFamily: typography.fontFamily[style.fontFamily],
    fontSize: style.fontSize,
    lineHeight: `${style.lineHeight}px`,
    fontWeight: Number(typography.fontWeight[style.fontWeight]),
    letterSpacing: style.letterSpacing,
  };
}
