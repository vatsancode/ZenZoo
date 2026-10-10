"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Icon, textStyle } from "@zenzoo/ui-web";
import { useEffect, useRef, useState } from "react";
import { PURCHASE_STATUS_LABEL, type PurchaseStatus } from "./purchases";

interface PurchaseStatusPickerProps {
  value: PurchaseStatus;
  onChange: (status: PurchaseStatus) => void;
}

// Grouped by how far along the purchase is, so the choices read as a progression.
const GROUPS: { title: string; statuses: PurchaseStatus[] }[] = [
  { title: "Not started", statuses: ["draft"] },
  { title: "Active", statuses: ["ordered", "partially_received"] },
  { title: "Closed", statuses: ["received", "cancelled"] },
];

/** The status marker: a dashed ring for draft, otherwise a filled dot in the status colour. */
function StatusDot({ status, size = 12 }: { status: PurchaseStatus; size?: number }) {
  const { colors } = useTheme();
  const fill: Record<PurchaseStatus, string> = {
    draft: colors.inkMuted,
    ordered: colors.accent,
    partially_received: colors.warning,
    received: colors.success,
    cancelled: colors.danger,
  };
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        boxSizing: "border-box",
        ...(status === "draft"
          ? { border: `2px dashed ${fill.draft}` }
          : { backgroundColor: fill[status] }),
      }}
    />
  );
}

/** A status dropdown for the top of the purchase page. */
export default function PurchaseStatusPicker({ value, onChange }: PurchaseStatusPickerProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${PURCHASE_STATUS_LABEL[value]}. Change status`}
        onClick={() => setOpen((current) => !current)}
        style={{
          ...textStyle("bodyMedium"),
          display: "inline-flex",
          alignItems: "center",
          gap: spacing[3],
          height: 44,
          paddingInline: spacing[5],
          border: `1px solid ${colors.border}`,
          borderRadius: radius.full,
          backgroundColor: "transparent",
          color: colors.ink,
          cursor: "pointer",
        }}
      >
        <StatusDot status={value} />
        {PURCHASE_STATUS_LABEL[value]}
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            color: colors.inkMuted,
            transform: open ? "rotate(90deg)" : "rotate(-90deg)",
            transition: "transform 120ms ease",
          }}
        >
          <Icon name="back" size={14} />
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Purchase status"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            width: 280,
            zIndex: 20,
            padding: spacing[3],
            backgroundColor: colors.surfaceRaised,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            boxShadow: elevation.md.web,
            boxSizing: "border-box",
          }}
        >
          {GROUPS.map((group, index) => (
            <div
              key={group.title}
              style={{
                paddingTop: index === 0 ? 0 : spacing[3],
                marginTop: index === 0 ? 0 : spacing[3],
                borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{
                  ...textStyle("caption"),
                  color: colors.inkMuted,
                  padding: `${spacing[1]}px ${spacing[3]}px ${spacing[2]}px`,
                }}
              >
                {group.title}
              </div>
              {group.statuses.map((status) => {
                const current = status === value;
                return (
                  <button
                    key={status}
                    type="button"
                    role="option"
                    aria-selected={current}
                    onClick={() => {
                      onChange(status);
                      setOpen(false);
                    }}
                    style={{
                      ...textStyle(current ? "bodyMedium" : "body"),
                      display: "flex",
                      alignItems: "center",
                      gap: spacing[3],
                      width: "100%",
                      height: 44,
                      paddingInline: spacing[3],
                      border: "none",
                      borderRadius: radius.md,
                      background: current ? colors.surfaceSunken : "transparent",
                      color: colors.ink,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <StatusDot status={status} />
                    <span style={{ flex: 1 }}>{PURCHASE_STATUS_LABEL[status]}</span>
                    {current ? <Icon name="check" size={16} /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
