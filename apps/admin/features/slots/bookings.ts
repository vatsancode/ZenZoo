// Mock store for bookings and blocked time. Shaped like the other feature data modules, so the real
// API can replace this file without the screens changing.

import { addDaysIso, todayIso } from "./slotTime";

export type BookingStatus = "booked" | "in_service" | "completed" | "cancelled" | "no_show";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  booked: "Booked",
  in_service: "In service",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const BOOKING_STATUS_TONES: Record<
  BookingStatus,
  "success" | "neutral" | "warning" | "danger"
> = {
  booked: "neutral",
  in_service: "warning",
  completed: "success",
  cancelled: "danger",
  no_show: "danger",
};

export interface Booking {
  id: string;
  serviceId: string;
  serviceName: string;
  employeeId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Minutes since midnight. */
  start: number;
  minutes: number;
  /** What the customer was quoted; 0 when the price is set at the till. */
  price: number;
  customerName: string;
  customerPhone: string;
  note?: string;
  status: BookingStatus;
}

export type BookingInput = Omit<Booking, "id" | "status">;

export type BlockReason = "break" | "leave" | "training" | "personal" | "other";

export const BLOCK_REASON_LABELS: Record<BlockReason, string> = {
  break: "Break",
  leave: "Leave",
  training: "Training",
  personal: "Personal",
  other: "Other",
};

/** Time an employee can't be booked. */
export interface TimeBlock {
  id: string;
  employeeId: string;
  date: string;
  start: number;
  end: number;
  reason: BlockReason;
}

export type TimeBlockInput = Omit<TimeBlock, "id">;

const BOOKINGS_KEY = "zenzoo.mock.bookings.v2";
const BLOCKS_KEY = "zenzoo.mock.time-blocks";

// Shown the first time, relative to today, so the calendar isn't empty.
function seedBookings(): Booking[] {
  const today = todayIso();
  return [
    {
      id: "bk-1",
      serviceId: "seed-haircut",
      serviceName: "Haircut",
      employeeId: "seed-1",
      date: today,
      start: 11 * 60,
      minutes: 45,
      price: 800,
      customerName: "Priya S",
      customerPhone: "9884011122",
      status: "booked",
    },
    {
      id: "bk-2",
      serviceId: "seed-beard",
      serviceName: "Beard trim",
      employeeId: "seed-2",
      date: today,
      start: 14 * 60,
      minutes: 30,
      price: 300,
      customerName: "Arun K",
      customerPhone: "9790055566",
      status: "booked",
    },
    {
      id: "bk-3",
      serviceId: "seed-haircut",
      serviceName: "Haircut",
      employeeId: "seed-1",
      date: addDaysIso(today, 1),
      start: 12 * 60,
      minutes: 45,
      price: 800,
      customerName: "Divya R",
      customerPhone: "9444077788",
      status: "booked",
    },
    {
      id: "bk-4",
      serviceId: "seed-beard",
      serviceName: "Beard trim",
      employeeId: "seed-4",
      date: today,
      start: 10 * 60 + 30,
      minutes: 30,
      price: 300,
      customerName: "Suresh M",
      customerPhone: "9941022334",
      status: "booked",
    },
    {
      id: "bk-5",
      serviceId: "seed-haircut",
      serviceName: "Haircut",
      employeeId: "seed-4",
      date: today,
      start: 15 * 60,
      minutes: 45,
      price: 800,
      customerName: "Vikram P",
      customerPhone: "9840099887",
      status: "booked",
    },
    {
      id: "bk-6",
      serviceId: "seed-haircut",
      serviceName: "Haircut",
      employeeId: "seed-5",
      date: today,
      start: 12 * 60,
      minutes: 45,
      price: 800,
      customerName: "Nisha T",
      customerPhone: "9677011223",
      status: "booked",
    },
    {
      id: "bk-7",
      serviceId: "seed-haircut",
      serviceName: "Haircut",
      employeeId: "seed-5",
      date: today,
      start: 16 * 60,
      minutes: 45,
      price: 800,
      customerName: "Kavya L",
      customerPhone: "9791033445",
      status: "booked",
    },
    {
      id: "bk-8",
      serviceId: "seed-haircut",
      serviceName: "Haircut",
      employeeId: "seed-6",
      date: today,
      start: 11 * 60 + 30,
      minutes: 45,
      price: 800,
      customerName: "Farah A",
      customerPhone: "9003044556",
      status: "booked",
    },
  ];
}

function seedBlocks(): TimeBlock[] {
  return [
    {
      id: "bl-1",
      employeeId: "seed-1",
      date: todayIso(),
      start: 13 * 60,
      end: 14 * 60,
      reason: "break",
    },
  ];
}

function load<T>(key: string, seed: () => T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // Storage blocked or unreadable: start from the seed.
  }
  return seed();
}

function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the change lasts until the page reloads.
  }
}

// Used when storage can't hold the lists, so booking still works within one visit.
let bookingsFallback: Booking[] | null = null;
let blocksFallback: TimeBlock[] | null = null;

const readBookings = () => bookingsFallback ?? load(BOOKINGS_KEY, seedBookings);
const readBlocks = () => blocksFallback ?? load(BLOCKS_KEY, seedBlocks);

function writeBookings(rows: Booking[]) {
  bookingsFallback = rows;
  save(BOOKINGS_KEY, rows);
}

function writeBlocks(rows: TimeBlock[]) {
  blocksFallback = rows;
  save(BLOCKS_KEY, rows);
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 120));

/** Cancelled and no-show bookings give the time back; everything else holds it. */
export const holdsTime = (booking: Booking) =>
  booking.status !== "cancelled" && booking.status !== "no_show";

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

export async function listBookings(): Promise<Booking[]> {
  await pause();
  return readBookings();
}

export async function listBlocks(): Promise<TimeBlock[]> {
  await pause();
  return readBlocks();
}

/** Books a slot. Returns the booking, or an error message when the time has just been taken. */
export async function addBooking(input: BookingInput): Promise<Booking | string> {
  await pause();
  const taken =
    readBookings().some(
      (row) =>
        holdsTime(row) &&
        row.employeeId === input.employeeId &&
        row.date === input.date &&
        overlaps(row.start, row.start + row.minutes, input.start, input.start + input.minutes),
    ) ||
    readBlocks().some(
      (row) =>
        row.employeeId === input.employeeId &&
        row.date === input.date &&
        overlaps(row.start, row.end, input.start, input.start + input.minutes),
    );
  if (taken) return "That time was just taken. Pick another slot.";
  const created: Booking = { ...input, id: crypto.randomUUID(), status: "booked" };
  writeBookings([...readBookings(), created]);
  return created;
}

export async function setBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<Booking | string> {
  await pause();
  const rows = readBookings();
  const current = rows.find((row) => row.id === id);
  if (!current) return "That booking no longer exists.";
  const updated = { ...current, status };
  writeBookings(rows.map((row) => (row.id === id ? updated : row)));
  return updated;
}

/** Blocks time. Returns the block, or an error message when a booking is already there. */
export async function addBlock(input: TimeBlockInput): Promise<TimeBlock | string> {
  await pause();
  const clash = readBookings().find(
    (row) =>
      holdsTime(row) &&
      row.employeeId === input.employeeId &&
      row.date === input.date &&
      overlaps(row.start, row.start + row.minutes, input.start, input.end),
  );
  if (clash) return `${clash.customerName} is booked in that time. Move or cancel it first.`;
  const created: TimeBlock = { ...input, id: crypto.randomUUID() };
  writeBlocks([...readBlocks(), created]);
  return created;
}

export async function removeBlock(id: string): Promise<void> {
  await pause();
  writeBlocks(readBlocks().filter((row) => row.id !== id));
}

/** What `addBlocks` could not block: a booking is already in that time. */
export interface SkippedBlock {
  employeeId: string;
  date: string;
  customerName: string;
}

/** Blocks many stretches in one go (one write), skipping any a booking is already in. */
export async function addBlocks(
  inputs: TimeBlockInput[],
): Promise<{ created: TimeBlock[]; skipped: SkippedBlock[] }> {
  await pause();
  const bookings = readBookings().filter(holdsTime);
  const created: TimeBlock[] = [];
  const skipped: SkippedBlock[] = [];
  for (const input of inputs) {
    const clash = bookings.find(
      (row) =>
        row.employeeId === input.employeeId &&
        row.date === input.date &&
        overlaps(row.start, row.start + row.minutes, input.start, input.end),
    );
    if (clash) {
      skipped.push({
        employeeId: input.employeeId,
        date: input.date,
        customerName: clash.customerName,
      });
    } else {
      created.push({ ...input, id: crypto.randomUUID() });
    }
  }
  if (created.length > 0) writeBlocks([...readBlocks(), ...created]);
  return { created, skipped };
}
