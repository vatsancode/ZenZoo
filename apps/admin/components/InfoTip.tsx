"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Icon, textStyle } from "@zenzoo/ui-web";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface InfoTipProps {
  label: string;
  children: ReactNode;
  /** "hover" opens on hover, focus or click; "click" opens only when clicked, for figures you don't want shown by accident. */
  mode?: "hover" | "click";
  /** Which edge of the icon the box lines up with; use "right" near the right edge of the screen. */
  align?: "left" | "right";
  width?: number;
}

/** A small (i) icon that shows a short explanation. */
export default function InfoTip({
  label,
  children,
  mode = "hover",
  align = "left",
  width = 300,
}: InfoTipProps) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const hover = mode === "hover";

  useEffect(() => {
    if (!open || hover) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, hover]);

  return (
    <span ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onMouseEnter={hover ? () => setOpen(true) : undefined}
        onMouseLeave={hover ? () => setOpen(false) : undefined}
        onFocus={hover ? () => setOpen(true) : undefined}
        onBlur={hover ? () => setOpen(false) : undefined}
        style={{
          display: "inline-flex",
          padding: 0,
          border: "none",
          background: "transparent",
          color: open ? colors.ink : colors.inkMuted,
          cursor: "pointer",
        }}
      >
        <Icon name="info" size={16} />
      </button>
      {open ? (
        <span
          role="tooltip"
          style={{
            ...textStyle("footnote"),
            position: "absolute",
            top: "calc(100% + 8px)",
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            width,
            maxWidth: "calc(100vw - 32px)",
            padding: spacing[4],
            backgroundColor: colors.surfaceSunken,
            color: colors.ink,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxSizing: "border-box",
            textAlign: "left",
            zIndex: 5,
          }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
