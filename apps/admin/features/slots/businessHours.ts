// Mock store for the shop's business hours, one entry per weekday. Read synchronously so the
// calendar and the availability rules can ask "is it open?" while rendering; shaped so the real
// API can replace this file (the reads would then come from what the board loads).

import { fromIso } from "./slotTime";

export interface DayHours {
  /** The shop doesn't open this weekday. */
  closed: boolean;
  /** Minutes since midnight. */
  open: number;
  close: number;
  /** More stretches on the same day, e.g. a second shift after a break. */
  extra?: Span[];
}

/** One stretch of the day, in minutes since midnight. */
export interface Span {
  open: number;
  close: number;
}

/** The stretches a day is open for: none when closed. */
export function rangesOf(day: DayHours): Span[] {
  return day.closed ? [] : [{ open: day.open, close: day.close }, ...(day.extra ?? [])];
}

/** Index 0 is Sunday, like Date.getDay(). */
export type WeekHours = DayHours[];

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Shown Monday first, the way a week is read here. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const KEY = "zenzoo.mock.business-hours";

const DEFAULT_DAY: DayHours = { closed: false, open: 10 * 60, close: 19 * 60 };
const defaults = (): WeekHours => Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }));

let cache: WeekHours | null = null;

function isWeek(value: unknown): value is WeekHours {
  return (
    Array.isArray(value) &&
    value.length === 7 &&
    value.every(
      (day) =>
        day &&
        typeof day.closed === "boolean" &&
        typeof day.open === "number" &&
        typeof day.close === "number" &&
        (day.extra === undefined ||
          (Array.isArray(day.extra) &&
            day.extra.every(
              (span: Span) => typeof span.open === "number" && typeof span.close === "number",
            ))),
    )
  );
}

export function getBusinessHours(): WeekHours {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isWeek(parsed)) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    // Storage blocked or unreadable: use the defaults.
  }
  cache = defaults();
  return cache;
}

export function saveBusinessHours(week: WeekHours): void {
  cache = week;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(week));
  } catch {
    // Storage blocked: the change lasts until the page reloads.
  }
}

/** The hours on one date (YYYY-MM-DD). */
export function hoursFor(date: string): DayHours {
  return getBusinessHours()[fromIso(date).getDay()] ?? DEFAULT_DAY;
}

/** The earliest opening and latest closing across the open days: what the calendar spans. */
export function gridBounds(): { open: number; close: number } {
  const spans = getBusinessHours().flatMap(rangesOf);
  if (spans.length === 0) return { open: DEFAULT_DAY.open, close: DEFAULT_DAY.close };
  return {
    open: Math.min(...spans.map((span) => span.open)),
    close: Math.max(...spans.map((span) => span.close)),
  };
}

/** One line for the settings row, e.g. "6 days a week, 10:00 AM to 7:00 PM". */
export function summarise(week: WeekHours, label: (minutes: number) => string): string {
  const open = WEEK_ORDER.filter((index) => !week[index]?.closed);
  if (open.length === 0) return "Closed every day";
  const first = week[open[0] ?? 0];
  const times = (day: DayHours | undefined) => (day ? JSON.stringify(rangesOf(day)) : "");
  const same = open.every((index) => times(week[index]) === times(first));
  const days =
    open.length === 7
      ? "Every day"
      : open.length === 1
        ? (WEEKDAY_NAMES[open[0] ?? 0] ?? "")
        : `${open.length} days a week`;
  return same && first
    ? `${days}, ${rangesOf(first)
        .map((span) => `${label(span.open)} to ${label(span.close)}`)
        .join(" and ")}`
    : days;
}

const SLOT_KEY = "zenzoo.mock.slot-minutes";
/** The shortest a slot can be; there is no upper limit. */
export const MIN_SLOT_MINUTES = 1;
const DEFAULT_SLOT_MINUTES = 15;

let slotCache: number | null = null;

/** How long one slot is: the grid's row, and the step bookings start on. */
export function getSlotMinutes(): number {
  if (slotCache !== null) return slotCache;
  try {
    const value = Number(window.localStorage.getItem(SLOT_KEY));
    if (Number.isInteger(value) && value >= MIN_SLOT_MINUTES) {
      slotCache = value;
      return value;
    }
  } catch {
    // Storage blocked or unreadable: use the default.
  }
  slotCache = DEFAULT_SLOT_MINUTES;
  return slotCache;
}

export function saveSlotMinutes(minutes: number): void {
  slotCache = minutes;
  try {
    window.localStorage.setItem(SLOT_KEY, String(minutes));
  } catch {
    // Storage blocked: the change lasts until the page reloads.
  }
}

const WORK_KEY = "zenzoo.mock.work-hours";

let workCache: Record<string, WeekHours> | null = null;

function readWork(): Record<string, WeekHours> {
  if (workCache) return workCache;
  try {
    const raw = window.localStorage.getItem(WORK_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const clean: Record<string, WeekHours> = {};
        for (const [id, week] of Object.entries(parsed)) if (isWeek(week)) clean[id] = week;
        workCache = clean;
        return clean;
      }
    }
  } catch {
    // Storage blocked or unreadable: nobody has their own hours.
  }
  workCache = {};
  return workCache;
}

/** One employee's own weekly hours; null when they follow the business hours. */
export function getWorkHours(employeeId: string): WeekHours | null {
  return readWork()[employeeId] ?? null;
}

export function saveWorkHours(employeeId: string, week: WeekHours): void {
  workCache = { ...readWork(), [employeeId]: week };
  try {
    window.localStorage.setItem(WORK_KEY, JSON.stringify(workCache));
  } catch {
    // Storage blocked: the change lasts until the page reloads.
  }
}

/** The stretches the shop is open on a date. */
export function shopRanges(date: string): Span[] {
  return rangesOf(hoursFor(date));
}

/**
 * When one employee can be booked on a date: the stretches of their own hours that fall inside the
 * business hours, or the business hours themselves when they have none of their own.
 */
export function workRanges(employeeId: string, date: string): Span[] {
  const shop = shopRanges(date);
  const own = getWorkHours(employeeId)?.[fromIso(date).getDay()];
  if (!own) return shop;
  return rangesOf(own).flatMap((mine) =>
    shop.flatMap((theirs) => {
      const open = Math.max(mine.open, theirs.open);
      const close = Math.min(mine.close, theirs.close);
      return close > open ? [{ open, close }] : [];
    }),
  );
}
