"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../IconButton";
import { textStyle } from "../internal/textStyle";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Shown at the top with a close button. Also the panel's accessible name unless `label` is set. */
  title?: string;
  /** Accessible name for the panel, when it differs from the title or there is no title. */
  label?: string;
  /** Pinned to the bottom of the panel while the content above scrolls. */
  footer?: ReactNode;
  width?: number;
}

/**
 * A panel that slides in from the right edge. Use it for focused tasks that
 * sit beside the page (adding or editing a record) rather than interrupting
 * it the way a Modal does.
 */
export function Sheet({ open, onClose, children, title, label, footer, width = 440 }: SheetProps) {
  const { colors, radius, spacing, elevation } = useTheme();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: `color-mix(in srgb, ${colors.ink} 24%, transparent)`,
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <aside
        role="dialog"
        aria-label={label ?? title}
        onClick={(event) => event.stopPropagation()}
        style={{
          width,
          maxWidth: "100vw",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          backgroundColor: colors.surfaceRaised,
          borderStartStartRadius: radius.xl,
          borderEndStartRadius: radius.xl,
          boxShadow: elevation.lg.web,
          boxSizing: "border-box",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: spacing[8] }}>
          {title ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing[4],
                marginBottom: spacing[6],
              }}
            >
              <div style={{ ...textStyle("title2"), color: colors.ink }}>{title}</div>
              <IconButton icon="close" label="Close" onClick={onClose} />
            </div>
          ) : null}
          {children}
        </div>
        {footer ? (
          <div
            style={{
              padding: `${spacing[4]}px ${spacing[8]}px`,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            {footer}
          </div>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
