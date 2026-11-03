"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { NETWORK_ERROR_EVENT, NETWORK_ERROR_MESSAGE } from "../lib/apiFetch";

const SHOWN_FOR_MS = 6000;

/** One message for "can't reach the server", shown above forms and popups. Repeats just restart the timer. */
export default function NetworkErrorBanner() {
  const { colors, radius, spacing } = useTheme();
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => {
    const show = () => setShownAt(Date.now());
    window.addEventListener(NETWORK_ERROR_EVENT, show);
    return () => window.removeEventListener(NETWORK_ERROR_EVENT, show);
  }, []);

  useEffect(() => {
    if (shownAt === null) return;
    const timer = setTimeout(() => setShownAt(null), SHOWN_FOR_MS);
    return () => clearTimeout(timer);
  }, [shownAt]);

  if (shownAt === null) return null;

  return (
    <div
      role="alert"
      style={{
        ...textStyle("callout"),
        position: "fixed",
        top: spacing[5],
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2000,
        maxWidth: "calc(100vw - 32px)",
        padding: `${spacing[3]}px ${spacing[5]}px`,
        borderRadius: radius.md,
        border: `1px solid ${colors.danger}`,
        backgroundColor: colors.surfaceRaised,
        color: colors.danger,
      }}
    >
      {NETWORK_ERROR_MESSAGE}
    </div>
  );
}
