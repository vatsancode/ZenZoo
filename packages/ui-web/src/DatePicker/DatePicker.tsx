"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Icon } from "../Icon";
import { IconButton } from "../IconButton";
import { textStyle } from "../internal/textStyle";

export interface DatePickerProps {
  /** An ISO date, YYYY-MM-DD, or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Earliest and latest pickable ISO dates. */
  min?: string;
  max?: string;
  /** Shows a Clear shortcut. On by default; turn off for a field that must always have a date. */
  clearable?: boolean;
  /** Which edge of the field the calendar lines up with. Use "right" for a field near the right edge. */
  align?: "left" | "right";
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  style?: CSSProperties;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PANEL_ESTIMATED_HEIGHT = 400;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function format(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A themed date field: a trigger that looks like an Input, and a month grid
 * that opens beneath it. Use it instead of the browser's own date input, whose
 * popup ignores the theme.
 */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Select a date",
  disabled,
  min,
  max,
  clearable = true,
  align = "left",
  style,
  ...aria
}: DatePickerProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const selected = fromIso(value);
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  // The date the keyboard is on; the month shown follows it.
  const [focused, setFocused] = useState<Date>(selected ?? today);
  // Days is the usual view; months and years let you jump far without paging.
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [yearStart, setYearStart] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const first = new Date(focused.getFullYear(), focused.getMonth(), 1);
  // Monday-first: getDay() is 0 for Sunday, so shift it to the end of the week.
  const lead = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => addDays(first, index - lead));

  const minDate = min ? fromIso(min) : null;
  const maxDate = max ? fromIso(max) : null;
  const blocked = (date: Date) =>
    Boolean((minDate && date < minDate) || (maxDate && date > maxDate));

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setOpenUp(
      window.innerHeight - rect.bottom < PANEL_ESTIMATED_HEIGHT &&
        rect.top > PANEL_ESTIMATED_HEIGHT,
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // Move real focus to the day the keyboard is on.
  useEffect(() => {
    if (!open || view !== "days") return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${toIso(focused)}"]`)?.focus();
  }, [open, view, focused]);

  function openPanel() {
    setFocused(selected ?? today);
    setView("days");
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(date: Date) {
    if (blocked(date)) return;
    onChange(toIso(date));
    close();
  }

  function shiftMonth(by: number) {
    setFocused((current) => {
      const target = new Date(current.getFullYear(), current.getMonth() + by, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      return new Date(
        target.getFullYear(),
        target.getMonth(),
        Math.min(current.getDate(), lastDay),
      );
    });
  }

  function withYear(current: Date, year: number, month = current.getMonth()): Date {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(current.getDate(), lastDay));
  }

  function pickMonth(month: number) {
    setFocused((current) => withYear(current, current.getFullYear(), month));
    setView("days");
  }

  function pickYear(year: number) {
    setFocused((current) => withYear(current, year));
    setView("months");
  }

  function showYears() {
    setYearStart(Math.floor(focused.getFullYear() / 12) * 12);
    setView("years");
  }

  // Previous / next means a month, a year, or a page of twelve years, depending on the view.
  function step(by: number) {
    if (view === "days") shiftMonth(by);
    else if (view === "months")
      setFocused((current) => withYear(current, current.getFullYear() + by));
    else setYearStart((current) => current + by * 12);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in moves && view === "days") {
      event.preventDefault();
      setFocused((current) => addDays(current, moves[event.key] ?? 0));
    } else if ((event.key === "PageUp" || event.key === "PageDown") && view === "days") {
      event.preventDefault();
      shiftMonth(event.key === "PageUp" ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // Escape backs out of the month and year views before it closes the calendar.
      if (view === "days") close();
      else setView("days");
    }
  }

  const textButton: CSSProperties = {
    ...textStyle("bodyMedium"),
    height: 36,
    paddingInline: spacing[3],
    border: "none",
    borderRadius: radius.md,
    background: "transparent",
    cursor: "pointer",
  };

  // Months and years sit in a 3 x 4 grid as tall as the days view, so the panel does not jump.
  const cellGrid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "repeat(4, 1fr)",
    gap: spacing[2],
    height: 264,
  };

  const bigCell = (isSelected: boolean, isCurrent: boolean, isBlocked: boolean): CSSProperties => ({
    ...textStyle(isSelected ? "bodyMedium" : "body"),
    border: `1px solid ${isCurrent && !isSelected ? colors.accent : "transparent"}`,
    borderRadius: radius.full,
    backgroundColor: isSelected ? colors.accent : "transparent",
    color: isSelected ? colors.onAccent : isBlocked ? colors.inkFaint : colors.ink,
    cursor: isBlocked ? "not-allowed" : "pointer",
  });

  const invalid = aria["aria-invalid"] === true;

  return (
    <span ref={rootRef} style={{ position: "relative", display: "block", ...style }}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"]}
        onClick={() => (open ? close(false) : openPanel())}
        style={{
          ...textStyle("body"),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[3],
          width: "100%",
          height: 44,
          paddingInline: spacing[4],
          borderRadius: radius.md,
          border: `1px solid ${invalid ? colors.danger : "transparent"}`,
          backgroundColor: colors.surfaceSunken,
          color: disabled ? colors.inkFaint : selected ? colors.ink : colors.inkFaint,
          boxSizing: "border-box",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
        }}
      >
        <span>{selected ? format(selected) : placeholder}</span>
        <span style={{ color: colors.inkMuted, display: "inline-flex" }}>
          <Icon name="calendar" size={18} />
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date"
          onKeyDown={handleKeyDown}
          style={{
            position: "absolute",
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            ...(openUp
              ? { bottom: "100%", marginBottom: spacing[1] }
              : { top: "100%", marginTop: spacing[1] }),
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            padding: spacing[4],
            backgroundColor: colors.surfaceRaised,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            boxShadow: elevation.md.web,
            boxSizing: "border-box",
            zIndex: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: spacing[3],
            }}
          >
            <IconButton
              icon="back"
              label={
                view === "days"
                  ? "Previous month"
                  : view === "months"
                    ? "Previous year"
                    : "Previous years"
              }
              onClick={() => step(-1)}
            />
            {view === "years" ? (
              <span style={{ ...textStyle("headline"), color: colors.ink }}>
                {yearStart} - {yearStart + 11}
              </span>
            ) : (
              <button
                type="button"
                aria-label={view === "days" ? "Choose month and year" : "Choose year"}
                onClick={() => (view === "days" ? setView("months") : showYears())}
                style={{
                  ...textStyle("headline"),
                  display: "inline-flex",
                  alignItems: "center",
                  gap: spacing[2],
                  height: 36,
                  paddingInline: spacing[3],
                  border: "none",
                  borderRadius: radius.full,
                  background: "transparent",
                  color: colors.ink,
                  cursor: "pointer",
                }}
              >
                {view === "days"
                  ? focused.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
                  : focused.getFullYear()}
                <span
                  style={{
                    display: "inline-flex",
                    transform: "rotate(-90deg)",
                    color: colors.inkMuted,
                  }}
                >
                  <Icon name="back" size={14} />
                </span>
              </button>
            )}
            <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
              <IconButton
                icon="back"
                label={
                  view === "days" ? "Next month" : view === "months" ? "Next year" : "Next years"
                }
                onClick={() => step(1)}
              />
            </span>
          </div>

          {view === "months" ? (
            <div style={cellGrid}>
              {MONTHS.map((name, month) => {
                const isSelected =
                  selected !== null &&
                  selected.getFullYear() === focused.getFullYear() &&
                  selected.getMonth() === month;
                const isCurrent =
                  today.getFullYear() === focused.getFullYear() && today.getMonth() === month;
                const isBlocked =
                  (minDate !== null && new Date(focused.getFullYear(), month + 1, 0) < minDate) ||
                  (maxDate !== null && new Date(focused.getFullYear(), month, 1) > maxDate);
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={isBlocked}
                    aria-pressed={isSelected}
                    onClick={() => pickMonth(month)}
                    style={bigCell(isSelected, isCurrent, isBlocked)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          ) : null}

          {view === "years" ? (
            <div style={cellGrid}>
              {Array.from({ length: 12 }, (_, index) => yearStart + index).map((year) => {
                const isSelected = selected !== null && selected.getFullYear() === year;
                const isCurrent = today.getFullYear() === year;
                const isBlocked =
                  (minDate !== null && year < minDate.getFullYear()) ||
                  (maxDate !== null && year > maxDate.getFullYear());
                return (
                  <button
                    key={year}
                    type="button"
                    disabled={isBlocked}
                    aria-pressed={isSelected}
                    onClick={() => pickYear(year)}
                    style={bigCell(isSelected, isCurrent, isBlocked)}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          ) : null}

          {view === "days" ? (
            <div
              ref={gridRef}
              role="grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 }}
            >
              {WEEKDAYS.map((day) => (
                <span
                  key={day}
                  style={{
                    ...textStyle("caption"),
                    color: colors.inkMuted,
                    textAlign: "center",
                    paddingBottom: spacing[2],
                  }}
                >
                  {day}
                </span>
              ))}
              {cells.map((date) => {
                const iso = toIso(date);
                const isSelected = selected !== null && iso === toIso(selected);
                const isToday = iso === toIso(today);
                const outside = date.getMonth() !== focused.getMonth();
                const isBlocked = blocked(date);
                return (
                  <button
                    key={iso}
                    type="button"
                    data-iso={iso}
                    disabled={isBlocked}
                    tabIndex={iso === toIso(focused) ? 0 : -1}
                    aria-label={date.toLocaleDateString("en-IN", { dateStyle: "full" })}
                    aria-pressed={isSelected}
                    onClick={() => choose(date)}
                    style={{
                      ...textStyle(isSelected ? "bodyMedium" : "body"),
                      justifySelf: "center",
                      width: 36,
                      height: 36,
                      borderRadius: radius.full,
                      border: `1px solid ${isToday && !isSelected ? colors.accent : "transparent"}`,
                      backgroundColor: isSelected ? colors.accent : "transparent",
                      color: isSelected
                        ? colors.onAccent
                        : isBlocked
                          ? colors.inkFaint
                          : outside
                            ? colors.inkMuted
                            : colors.ink,
                      opacity: outside && !isSelected ? 0.6 : 1,
                      cursor: isBlocked ? "not-allowed" : "pointer",
                    }}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: spacing[3],
              paddingTop: spacing[3],
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            {clearable ? (
              <button
                type="button"
                style={{ ...textButton, color: colors.inkMuted }}
                onClick={() => {
                  onChange("");
                  close();
                }}
              >
                Clear
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={blocked(today)}
              style={{ ...textButton, color: colors.accent }}
              onClick={() => choose(today)}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
