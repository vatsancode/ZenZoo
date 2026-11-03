// Which times an employee is free. Pure functions over the booking and block lists, so the same
// logic can move to the server later and be checked on its own.

import { holdsTime, type Booking, type TimeBlock } from "./bookings";
import { getSlotMinutes, workRanges } from "./businessHours";
import { addDaysIso, nowMinutes, todayIso } from "./slotTime";

interface Span {
  start: number;
  end: number;
}

function busySpans(
  employeeId: string,
  date: string,
  bookings: Booking[],
  blocks: TimeBlock[],
): Span[] {
  return [
    ...bookings
      .filter((row) => holdsTime(row) && row.employeeId === employeeId && row.date === date)
      .map((row) => ({ start: row.start, end: row.start + row.minutes })),
    ...blocks
      .filter((row) => row.employeeId === employeeId && row.date === date)
      .map((row) => ({ start: row.start, end: row.end })),
  ];
}

/** Every start time (minutes since midnight) at which `minutes` fits, with nothing already there. */
export function freeStarts(
  employeeId: string,
  date: string,
  minutes: number,
  bookings: Booking[],
  blocks: TimeBlock[],
): number[] {
  const STEP = getSlotMinutes();
  // Past days have nothing left; today, nothing earlier than the next slot.
  if (date < todayIso()) return [];
  const earliest = date === todayIso() ? Math.ceil(nowMinutes() / STEP) * STEP : 0;
  const busy = busySpans(employeeId, date, bookings, blocks);
  const starts: number[] = [];
  for (const range of workRanges(employeeId, date)) {
    for (
      let start = Math.max(range.open, earliest);
      start + minutes <= range.close;
      start += STEP
    ) {
      const end = start + minutes;
      if (!busy.some((span) => start < span.end && span.start < end)) starts.push(start);
    }
  }
  return starts;
}

/** The earliest free start in the next two weeks, or null when there is none. */
export function nextFree(
  employeeId: string,
  fromDate: string,
  minutes: number,
  bookings: Booking[],
  blocks: TimeBlock[],
): { date: string; start: number } | null {
  for (let offset = 0; offset < 14; offset += 1) {
    const date = addDaysIso(fromDate, offset);
    const first = freeStarts(employeeId, date, minutes, bookings, blocks)[0];
    if (first !== undefined) return { date, start: first };
  }
  return null;
}
