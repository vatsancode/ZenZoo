"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, DatePicker, Icon, textStyle } from "@zenzoo/ui-web";
import { useEffect, useRef, useState } from "react";
import {
  describeRange,
  MAX_RANGE_DAYS,
  rangeDays,
  rangePresets,
  type DateRange,
} from "../lib/dashboard";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/** A date range button that opens quick presets on the left and a custom From / To on the right. */
export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const rootRef = useRef<HTMLDivElement>(null);

  // Each time it opens, the custom dates start from what is applied.
  useEffect(() => {
    if (open) {
      setFrom(value.from);
      setTo(value.to);
    }
  }, [open, value]);

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

  const presets = rangePresets();
  const label = describeRange(value);
  const custom: DateRange = { from, to };
  const problem =
    from === "" || to === ""
      ? "Choose both dates."
      : from > to
        ? "The start must be before the end."
        : rangeDays(custom) > MAX_RANGE_DAYS
          ? "Pick a range of a year or less."
          : null;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          ...textStyle("bodyMedium"),
          display: "inline-flex",
          alignItems: "center",
          gap: spacing[3],
          height: 44,
          paddingInline: spacing[5],
          border: `1px solid ${open ? colors.accent : colors.border}`,
          borderRadius: radius.full,
          backgroundColor: "transparent",
          color: colors.ink,
          cursor: "pointer",
        }}
      >
        <span style={{ color: colors.inkMuted, display: "inline-flex" }}>
          <Icon name="calendar" size={18} />
        </span>
        {label}
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
          role="dialog"
          aria-label="Choose a date range"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 20,
            width: 520,
            maxWidth: "calc(100vw - 32px)",
            display: "grid",
            gridTemplateColumns: "190px minmax(0, 1fr)",
            backgroundColor: colors.surfaceRaised,
            borderRadius: radius.lg,
            boxShadow: elevation.md.web,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[1],
              padding: spacing[3],
              borderRight: `1px solid ${colors.border}`,
            }}
          >
            {presets.map((preset) => {
              const active = preset.range.from === value.from && preset.range.to === value.to;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onChange(preset.range);
                    setOpen(false);
                  }}
                  style={{
                    ...textStyle(active ? "bodyMedium" : "body"),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: 40,
                    paddingInline: spacing[3],
                    border: "none",
                    borderRadius: radius.md,
                    background: active ? colors.surfaceSunken : "transparent",
                    color: colors.ink,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {preset.label}
                  {active ? <Icon name="check" size={16} /> : null}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[5],
              padding: spacing[5],
            }}
          >
            <div style={{ ...textStyle("headline"), color: colors.ink }}>Custom range</div>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
              <label
                htmlFor="range-from"
                style={{ ...textStyle("caption"), color: colors.inkMuted }}
              >
                FROM
              </label>
              <DatePicker
                id="range-from"
                value={from}
                clearable={false}
                max={to || undefined}
                onChange={setFrom}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
              <label htmlFor="range-to" style={{ ...textStyle("caption"), color: colors.inkMuted }}>
                TO
              </label>
              <DatePicker
                id="range-to"
                value={to}
                clearable={false}
                min={from || undefined}
                align="right"
                onChange={setTo}
              />
            </div>
            {problem ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {problem}
              </div>
            ) : null}
            <Button
              type="button"
              variant="primary"
              disabled={problem !== null}
              onClick={() => {
                onChange(custom);
                setOpen(false);
              }}
            >
              Apply range
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
