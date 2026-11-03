// Dates and times of day for the slot screens. A date is an ISO string (YYYY-MM-DD) and a time of
// day is minutes since midnight, so comparing and adding stay plain arithmetic.

const pad = (value: number) => String(value).padStart(2, "0");

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromIso(iso: string): Date {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** Minutes since midnight, right now. */
export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** 990 -> "4:30 PM". */
export function timeLabel(minutes: number): string {
  // 1440 is the end of the day: midnight.
  const hours = Math.floor(minutes / 60) % 24;
  const rest = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${pad(rest)} ${suffix}`;
}

/** 45 -> "45 min", 90 -> "1 h 30 min". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "Today", "Tomorrow", or "Fri, 1 Nov". */
export function dayLabel(iso: string): string {
  const today = todayIso();
  if (iso === today) return "Today";
  if (iso === addDaysIso(today, 1)) return "Tomorrow";
  return fromIso(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "Friday, 1 November 2026". */
export function longDayLabel(iso: string): string {
  return fromIso(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
