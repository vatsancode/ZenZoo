import { useTheme } from "@zenzoo/design-tokens";
import type { CSSProperties } from "react";
import { Button } from "../Button";
import { textStyle } from "../internal/textStyle";

export interface LoadErrorProps {
  /** What couldn't be loaded, as a sentence - e.g. "Couldn't load the vendors." */
  message: string;
  /** Tries the load again. */
  onRetry: () => void;
  /** True while the retry is running; the button shows its spinner and ignores clicks. */
  retrying?: boolean;
  /** For placing it (margins); the look is fixed. */
  style?: CSSProperties;
}

/** Shown in place of content that failed to load, with a way to try again. */
export function LoadError({ message, onRetry, retrying = false, style }: LoadErrorProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing[4],
        padding: spacing[5],
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceSunken,
        ...style,
      }}
    >
      <span style={{ ...textStyle("callout"), color: colors.ink, overflowWrap: "anywhere" }}>
        {message}
      </span>
      <Button variant="secondary" loading={retrying} onClick={onRetry} style={{ flex: "none" }}>
        Try again
      </Button>
    </div>
  );
}
