"use client";

import { useTheme } from "@zenzoo/design-tokens";
import type { KeyboardEvent } from "react";
import { textStyle } from "../internal/textStyle";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Label for the tab list, for screen readers. */
  "aria-label": string;
}

/**
 * A row of tabs sitting on a hairline. Render the matching panel yourself
 * with `role="tabpanel"` and `aria-labelledby={`tab-${id}`}`.
 */
export function Tabs({ tabs, value, onChange, ...aria }: TabsProps) {
  const { colors, spacing } = useTheme();

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={aria["aria-label"]}
      style={{
        display: "flex",
        gap: spacing[12],
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={{
              ...textStyle(active ? "headline" : "body"),
              background: "none",
              border: "none",
              borderBottom: `2px solid ${active ? colors.accent : "transparent"}`,
              marginBottom: -1,
              padding: `${spacing[4]}px 0`,
              color: active ? colors.ink : colors.inkMuted,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
