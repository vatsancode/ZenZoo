"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";
import type { ReactNode } from "react";

export interface ProviderChoice {
  /** "any", or an employee id. */
  id: string;
  title: string;
  /** Price, time and the next free slot, already worded. */
  detail: string;
  /** What stands for them on the left: their picture or initials. */
  leading: ReactNode;
}

interface ProviderPickerProps {
  choices: ProviderChoice[];
  value: string;
  onChange: (id: string) => void;
}

/** Who should do it, as a list of cards showing what each costs, how long they take and when they are next free. */
export default function ProviderPicker({ choices, value, onChange }: ProviderPickerProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Provider"
      style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}
    >
      {choices.map((choice) => {
        const selected = choice.id === value;
        return (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing[3],
              width: "100%",
              padding: `${spacing[3]}px ${spacing[4]}px`,
              textAlign: "left",
              cursor: "pointer",
              color: colors.ink,
              backgroundColor: selected ? colors.surfaceSunken : "transparent",
              border: `${selected ? 2 : 1}px solid ${selected ? colors.accent : colors.border}`,
              borderRadius: radius.lg,
            }}
          >
            {choice.leading}
            <span style={{ minWidth: 0 }}>
              <span style={{ ...textStyle("bodyMedium"), display: "block" }}>{choice.title}</span>
              <span style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}>
                {choice.detail}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface SlotOption {
  key: string;
  /** The time, e.g. "4:30 PM". */
  label: string;
  /** Who and how much, shown under the time when slots from different providers are mixed. */
  sub?: string;
}

interface SlotChipsProps {
  /** Titled groups, e.g. Morning, Afternoon, Evening; empty ones are left out. */
  groups: { title: string; options: SlotOption[] }[];
  value: string;
  onChange: (key: string) => void;
}

/** Free times as tap targets, grouped by part of the day. */
export function SlotChips({ groups, value, onChange }: SlotChipsProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
      {groups
        .filter((group) => group.options.length > 0)
        .map((group) => (
          <div key={group.title}>
            <div
              style={{ ...textStyle("caption"), color: colors.inkMuted, marginBottom: spacing[2] }}
            >
              {group.title.toUpperCase()}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: spacing[2] }}>
              {group.options.map((option) => {
                const selected = option.key === value;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(option.key)}
                    style={{
                      ...textStyle("bodyMedium"),
                      minWidth: 88,
                      padding: `${spacing[2]}px ${spacing[3]}px`,
                      cursor: "pointer",
                      textAlign: "center",
                      color: selected ? colors.onAccent : colors.ink,
                      backgroundColor: selected ? colors.accent : colors.surfaceSunken,
                      border: "none",
                      borderRadius: radius.full,
                    }}
                  >
                    {option.label}
                    {option.sub ? (
                      <span
                        style={{
                          ...textStyle("footnote"),
                          display: "block",
                          color: selected ? colors.onAccent : colors.inkMuted,
                        }}
                      >
                        {option.sub}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
