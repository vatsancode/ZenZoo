import { useTheme } from "@zenzoo/design-tokens";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  const { colors, radius, spacing, elevation } = useTheme();

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
        backgroundColor: `color-mix(in srgb, ${colors.ink} 40%, transparent)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing[8],
        boxSizing: "border-box",
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundColor: colors.surfaceRaised,
          borderRadius: radius.xl,
          padding: spacing[8],
          boxShadow: elevation.lg.web,
          minWidth: 320,
          maxWidth: "90vw",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
