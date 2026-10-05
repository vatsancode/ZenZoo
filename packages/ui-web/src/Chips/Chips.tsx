"use client";

import { useTheme } from "@zenzoo/design-tokens";
import type { KeyboardEvent } from "react";
import { Icon } from "../Icon";
import { textStyle } from "../internal/textStyle";

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipsProps {
  options: ChipOption[];
  /** The chosen option's value, or "" when nothing is chosen yet. */
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  /**
   * Lay the chips out in this many equal columns, each as wide as its column
   * and as tall as its tallest neighbour. Without it they sit side by side at
   * their natural width.
   */
  columns?: number;
}

/** A row of pill choices where exactly one can be picked - for short lists and filters. */
export function Chips({ options, value, onChange, columns, ...aria }: ChipsProps) {
  const { colors, radius, spacing } = useTheme();

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    document.getElementById(`chip-${next.value}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      style={
        columns
          ? {
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: spacing[2],
            }
          : { display: "flex", flexWrap: "wrap", gap: spacing[2] }
      }
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`chip-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value === "" && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={{
              ...textStyle("callout"),
              ...(columns
                ? { minHeight: 44, paddingBlock: spacing[2], textAlign: "center" as const }
                : { height: 36 }),
              paddingInline: spacing[4],
              borderRadius: radius.full,
              border: `1px solid ${selected ? colors.accent : colors.border}`,
              backgroundColor: selected ? colors.surfaceSunken : "transparent",
              color: selected ? colors.ink : colors.inkMuted,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface MultiChipsProps {
  options: ChipOption[];
  /** The values currently picked. Empty means none picked. */
  value: string[];
  onChange: (value: string[]) => void;
  "aria-label": string;
  /** Lay the chips out in this many equal columns, as with `Chips`. */
  columns?: number;
}

/** Pill choices where any number can be picked - for filters. A picked chip carries a tick. */
export function MultiChips({ options, value, onChange, columns, ...aria }: MultiChipsProps) {
  const { colors, radius, spacing } = useTheme();

  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  }

  return (
    <div
      role="group"
      aria-label={aria["aria-label"]}
      style={
        columns
          ? {
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: spacing[2],
            }
          : { display: "flex", flexWrap: "wrap", gap: spacing[2] }
      }
    >
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(option.value)}
            style={{
              ...textStyle("callout"),
              ...(columns ? { minHeight: 44, paddingBlock: spacing[2] } : { height: 36 }),
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing[2],
              paddingInline: spacing[4],
              borderRadius: radius.full,
              border: `1px solid ${selected ? colors.accent : colors.border}`,
              backgroundColor: selected ? colors.surfaceSunken : "transparent",
              color: selected ? colors.ink : colors.inkMuted,
              cursor: "pointer",
            }}
          >
            {selected ? <Icon name="check" size={14} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
