"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Button,
  DatePicker,
  Icon,
  IconButton,
  Input,
  LoadError,
  Notice,
  Skeleton,
  textStyle,
} from "@zenzoo/ui-web";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listCatalogueItems } from "../../lib/catalogue-items";
import { listCustomers, type Customer } from "../../lib/customers";
import { useSingleFlight } from "../../lib/useSingleFlight";
import { listEmployees, type Employee } from "../employees/employees";
import BookingDetailModal from "./BookingDetailModal";
import BookingSheet, { type BookableService, type SlotPrefill } from "./BookingSheet";
import {
  addBlock,
  addBooking,
  listBlocks,
  listBookings,
  holdsTime,
  removeBlock,
  setBookingStatus,
  BOOKING_STATUS_LABELS,
  type Booking,
  type BookingStatus,
  type TimeBlock,
} from "./bookings";
import DayGrid from "./DayGrid";
import SlotSettingsSheet from "./SlotSettingsSheet";
import { listServiceSetups } from "./serviceSetup";
import { hoursFor, WEEKDAY_NAMES } from "./businessHours";
import { addDaysIso, dayLabel, fromIso, timeLabel, todayIso } from "./slotTime";

/** The day's calendar: who is booked when, and the place to take a booking or block time. */
export default function SlotsBoard() {
  const { colors, spacing } = useTheme();
  const [date, setDate] = useState(todayIso());
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [services, setServices] = useState<BookableService[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [sheet, setSheet] = useState<{ prefill: SlotPrefill | null } | null>(null);
  const [, setHoursVersion] = useState(0);
  const [settingsFor, setSettingsFor] = useState<{ employee: Employee | null } | null>(null);
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);
  const [openBlock, setOpenBlock] = useState<TimeBlock | null>(null);
  const { busy: loading, run: runLoad } = useSingleFlight();

  const load = useCallback(
    () =>
      runLoad(async () => {
        setLoadFailed(false);
        try {
          const [staff, items, setups, bookingRows, blockRows] = await Promise.all([
            listEmployees(),
            // Without Catalogue access there are simply no services to book.
            listCatalogueItems().catch(() => []),
            listServiceSetups(),
            listBookings(),
            listBlocks(),
          ]);
          setEmployees(staff.filter((employee) => employee.status === "active"));
          setServices(
            // Every made-to-order item can be booked: with no setup saved, anyone does it at its own price.
            items.flatMap((item) =>
              item.kind === "made_to_order"
                ? [
                    {
                      id: item.id,
                      name: item.name,
                      price: item.price,
                      setup: setups[item.id] ?? { providers: [] },
                    },
                  ]
                : [],
            ),
          );
          setBookings(bookingRows);
          setBlocks(blockRows);
        } catch {
          setLoadFailed(true);
        }
      }),
    [runLoad],
  );

  useEffect(() => {
    void load();
    // Only to recognise a returning customer by phone, so failing is fine.
    listCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const search = query.trim().toLowerCase();
  const employeeMatches = useCallback(
    (employee: Employee) => employee.name.toLowerCase().includes(search),
    [search],
  );
  const bookingMatches = useCallback(
    (booking: Booking) =>
      booking.customerName.toLowerCase().includes(search) || booking.customerPhone.includes(search),
    [search],
  );

  // While searching, keep the people who match and the people with a matching booking today.
  const visibleEmployees = useMemo(() => {
    if (!employees || !search) return employees;
    return employees.filter(
      (employee) =>
        employeeMatches(employee) ||
        bookings.some(
          (row) =>
            row.employeeId === employee.id &&
            row.date === date &&
            holdsTime(row) &&
            bookingMatches(row),
        ),
    );
  }, [employees, search, bookings, date, employeeMatches, bookingMatches]);

  // Days other than the one on screen where this customer is booked, soonest first.
  const otherDays = useMemo(() => {
    if (!search) return [];
    const days = bookings
      .filter((row) => row.date !== date && holdsTime(row) && bookingMatches(row))
      .map((row) => row.date);
    return [...new Set(days)].sort().slice(0, 5);
  }, [search, bookings, date, bookingMatches]);

  async function book(input: Parameters<typeof addBooking>[0]): Promise<string | null> {
    const result = await addBooking(input);
    if (typeof result === "string") return result;
    setBookings((current) => [...current, result]);
    setDate(result.date);
    setSheet(null);
    setNotice(
      `Booked ${result.customerName} for ${result.serviceName} on ${dayLabel(result.date)} at ${timeLabel(result.start)}.`,
    );
    return null;
  }

  async function block(input: Parameters<typeof addBlock>[0]): Promise<string | null> {
    const result = await addBlock(input);
    if (typeof result === "string") return result;
    setBlocks((current) => [...current, result]);
    setDate(result.date);
    setSheet(null);
    setNotice("Time blocked.");
    return null;
  }

  async function changeStatus(booking: Booking, status: BookingStatus) {
    const result = await setBookingStatus(booking.id, status);
    if (typeof result === "string") {
      setNotice(result);
      return;
    }
    setBookings((current) => current.map((row) => (row.id === result.id ? result : row)));
    setOpenBooking(null);
    setNotice(`${result.customerName}: ${BOOKING_STATUS_LABELS[status].toLowerCase()}.`);
  }

  async function freeBlock(target: TimeBlock) {
    await removeBlock(target.id);
    setBlocks((current) => current.filter((row) => row.id !== target.id));
    setOpenBlock(null);
    setNotice("Time freed.");
  }

  const step = (days: number) => setDate((current) => addDaysIso(current, days));

  if (loadFailed) {
    return (
      <LoadError
        message="Couldn't load the slots."
        onRetry={() => void load()}
        retrying={loading}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: spacing[4],
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: spacing[2], flexWrap: "wrap" }}>
          <div style={{ width: 280, maxWidth: "100%", marginRight: spacing[2] }}>
            <Input
              type="search"
              placeholder="Search customer or employee..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search customer or employee"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            aria-label="Previous day"
            onClick={() => step(-1)}
          >
            <Icon name="back" size={18} />
          </Button>
          <Button type="button" variant="secondary" aria-label="Next day" onClick={() => step(1)}>
            <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
              <Icon name="back" size={18} />
            </span>
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDate(todayIso())}>
            Today
          </Button>
          <div style={{ width: 200 }}>
            <DatePicker value={date} onChange={setDate} clearable={false} aria-label="Pick a day" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
          <IconButton
            icon="settings"
            label="Slot settings"
            onClick={() => setSettingsFor({ employee: null })}
          />
          <Button type="button" variant="primary" onClick={() => setSheet({ prefill: null })}>
            New booking
          </Button>
        </div>
      </div>

      {notice ? <Notice>{notice}</Notice> : null}

      {hoursFor(date).closed ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          The shop is closed on {WEEKDAY_NAMES[fromIso(date).getDay()]}s, so nothing can be booked
          on this day.
        </div>
      ) : null}

      {search && otherDays.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: spacing[2] }}>
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>Also booked on:</span>
          {otherDays.map((day) => (
            <Button key={day} type="button" variant="secondary" onClick={() => setDate(day)}>
              {dayLabel(day)}
            </Button>
          ))}
        </div>
      ) : null}

      {employees === null ? (
        <Skeleton variant="block" height={spacing[16] * 6} />
      ) : employees.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          No active employees yet. <Link href="/employees">Add employees</Link> to start taking
          bookings.
        </div>
      ) : visibleEmployees?.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          No customer or employee matches &quot;{query.trim()}&quot; on this day.
        </div>
      ) : (
        <DayGrid
          employees={visibleEmployees ?? employees}
          date={date}
          bookings={bookings}
          blocks={blocks}
          isMatch={
            search
              ? (booking) => {
                  const owner = employees.find((item) => item.id === booking.employeeId);
                  return bookingMatches(booking) || (owner ? employeeMatches(owner) : false);
                }
              : undefined
          }
          onEmptyClick={(employeeId, start) => setSheet({ prefill: { employeeId, date, start } })}
          onBookingClick={setOpenBooking}
          onSettingsClick={(employee) => setSettingsFor({ employee })}
          onBlockClick={setOpenBlock}
        />
      )}

      <BookingSheet
        open={sheet !== null}
        prefill={sheet?.prefill ?? null}
        calendarDate={date}
        services={services}
        employees={employees ?? []}
        bookings={bookings}
        blocks={blocks}
        customers={customers}
        onClose={() => setSheet(null)}
        onBook={book}
        onBlock={block}
      />

      <SlotSettingsSheet
        open={settingsFor !== null}
        employee={settingsFor?.employee ?? null}
        employees={employees ?? []}
        calendarDate={date}
        onClose={() => setSettingsFor(null)}
        // The settings live in their own store; this just redraws the calendar from it.
        onSaved={(message) => {
          setHoursVersion((current) => current + 1);
          setNotice(message);
        }}
        onBlocked={(message) => {
          setSettingsFor(null);
          setNotice(message);
          void listBlocks().then(setBlocks);
        }}
      />

      <BookingDetailModal
        booking={openBooking}
        block={openBlock}
        employees={employees ?? []}
        onClose={() => {
          setOpenBooking(null);
          setOpenBlock(null);
        }}
        onStatus={changeStatus}
        onRemoveBlock={freeBlock}
      />
    </div>
  );
}
