import { colors, radius, spacing, elevation } from "@zenzoo/design-tokens";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
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
        backgroundColor: "rgba(18, 19, 23, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundColor: colors.background,
          borderRadius: radius.lg,
          padding: spacing[6],
          boxShadow: elevation.lg.web,
          minWidth: 320,
          maxWidth: "90vw",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
