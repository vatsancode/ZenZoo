import { useTheme } from "@zenzoo/design-tokens";
import type { CSSProperties, ReactNode } from "react";
import { textStyle } from "../internal/textStyle";

export interface NoticeProps {
  children: ReactNode;
  /** For placing it (margins); the look is fixed. */
  style?: CSSProperties;
}

/** A short confirmation shown after something was done, announced to screen readers. */
export function Notice({ children, style }: NoticeProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <div
      role="status"
      style={{
        ...textStyle("callout"),
        color: colors.ink,
        backgroundColor: colors.surfaceSunken,
        borderRadius: radius.md,
        padding: spacing[4],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
