"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, DatePicker, IconButton, Modal, Select, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import FormField from "../../components/FormField";
import { formatPrice } from "../../lib/stock-display";
import { useSingleFlight } from "../../lib/useSingleFlight";
import type { Employee } from "../employees/employees";
import {
  BLOCK_REASON_LABELS,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TONES,
  type Booking,
  type BookingStatus,
  type TimeBlock,
} from "./bookings";
import { freeStarts } from "./availability";
import { dayLabel, durationLabel, timeLabel, todayIso } from "./slotTime";

interface BookingDetailModalProps {
  /** One of these is open; both null means closed. */
  booking: Booking | null;
  block: TimeBlock | null;
  employees: Employee[];
  bookings: Booking[];
  blocks: TimeBlock[];
  onClose: () => void;
  onStatus: (booking: Booking, status: BookingStatus) => Promise<void>;
  onRemoveBlock: (block: TimeBlock) => Promise<void>;
  /** Resolves to an error message, or null once moved. */
  onReschedule: (
    booking: Booking,
    to: { employeeId: string; date: string; start: number },
  ) => Promise<string | null>;
}

/** What a click on the calendar opens: the booking with the next step on it, or the blocked time. */
export default function BookingDetailModal({
  booking,
  block,
  employees,
  bookings,
  blocks,
  onClose,
  onStatus,
  onRemoveBlock,
  onReschedule,
}: BookingDetailModalProps) {
  const { colors, spacing } = useTheme();
  const { busy, run } = useSingleFlight();
  const [moving, setMoving] = useState(false);
  const [toEmployee, setToEmployee] = useState("");
  const [toDate, setToDate] = useState("");
  const [toStart, setToStart] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);

  // Each booking opens on its details, not the move form.
  useEffect(() => {
    setMoving(false);
    setMoveError(null);
    if (booking) {
      setToEmployee(booking.employeeId);
      setToDate(booking.date);
      setToStart(String(booking.start));
    }
    // Only when a different booking opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id]);

  // Free times for the chosen person and day; the booking's own time counts as free.
  const times = useMemo(() => {
    if (!booking || !toEmployee || !toDate) return [];
    const others = bookings.filter((row) => row.id !== booking.id);
    return freeStarts(toEmployee, toDate, booking.minutes, others, blocks);
  }, [booking, toEmployee, toDate, bookings, blocks]);
  const timeValid = times.includes(Number(toStart));
  const moved =
    booking !== null &&
    (toEmployee !== booking.employeeId ||
      toDate !== booking.date ||
      Number(toStart) !== booking.start);
  const who = (id: string) => employees.find((item) => item.id === id)?.name ?? "Unknown";

  const row = (label: string, value: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: spacing[4] }}>
      <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>{label}</span>
      <span style={{ ...textStyle("callout"), color: colors.ink, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );

  const step = (status: BookingStatus, label: string, primary = false) => (
    <Button
      type="button"
      variant={primary ? "primary" : "secondary"}
      disabled={busy}
      onClick={() => booking && void run(() => onStatus(booking, status))}
    >
      {label}
    </Button>
  );

  return (
    <Modal open={booking !== null || block !== null} onClose={busy ? () => undefined : onClose}>
      <div
        style={{
          width: 560,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: spacing[5],
        }}
      >
        {booking ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing[3],
              }}
            >
              <div style={{ ...textStyle("title3"), color: colors.ink, flex: 1 }}>
                {booking.serviceName}
              </div>
              <Badge tone={BOOKING_STATUS_TONES[booking.status]}>
                {BOOKING_STATUS_LABELS[booking.status]}
              </Badge>
              <IconButton icon="close" label="Close" disabled={busy} onClick={onClose} />
            </div>
            {moving ? (
              <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
                <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  {booking.customerName} · {durationLabel(booking.minutes)}. Pick a new day, time or
                  person.
                </div>
                <FormField id="move-employee" label="PROVIDER" span={12}>
                  <Select
                    id="move-employee"
                    options={employees.map((item) => ({ value: item.id, label: item.name }))}
                    value={toEmployee}
                    searchable
                    onChange={(next) => {
                      setToEmployee(next);
                      setMoveError(null);
                    }}
                  />
                </FormField>
                <FormField id="move-date" label="DATE" span={12}>
                  <DatePicker
                    id="move-date"
                    value={toDate}
                    onChange={(next) => {
                      setToDate(next);
                      setMoveError(null);
                    }}
                    min={todayIso()}
                    clearable={false}
                  />
                </FormField>
                <FormField id="move-time" label="TIME" span={12}>
                  <Select
                    id="move-time"
                    options={times.map((start) => ({
                      value: String(start),
                      label: timeLabel(start),
                    }))}
                    value={timeValid ? toStart : ""}
                    placeholder={times.length === 0 ? "No free times" : "Select a time"}
                    searchable={false}
                    onChange={(next) => {
                      setToStart(next);
                      setMoveError(null);
                    }}
                  />
                </FormField>
                {moveError ? (
                  <div style={{ ...textStyle("footnote"), color: colors.danger }}>{moveError}</div>
                ) : null}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
                {row("Customer", booking.customerName)}
                {row("Mobile", booking.customerPhone)}
                {row("Provider", who(booking.employeeId))}
                {row(
                  "When",
                  `${dayLabel(booking.date)}, ${timeLabel(booking.start)} to ${timeLabel(booking.start + booking.minutes)}`,
                )}
                {row("Takes", durationLabel(booking.minutes))}
                {row("Price", booking.price > 0 ? formatPrice(booking.price) : "Set at the till")}
                {booking.note ? row("Note", booking.note) : null}
              </div>
            )}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: spacing[2],
              }}
            >
              {booking.status === "booked" && moving ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setMoving(false)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy || !moved || !timeValid}
                    onClick={() =>
                      void run(async () => {
                        const error = await onReschedule(booking, {
                          employeeId: toEmployee,
                          date: toDate,
                          start: Number(toStart),
                        });
                        if (error) setMoveError(error);
                      })
                    }
                  >
                    Save new time
                  </Button>
                </>
              ) : null}
              {booking.status === "booked" && !moving ? (
                <>
                  <div style={{ display: "flex", gap: spacing[2], flexWrap: "wrap" }}>
                    {step("cancelled", "Cancel booking")}
                    {step("no_show", "No-show")}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setMoving(true)}
                    >
                      Reschedule
                    </Button>
                  </div>
                  {step("in_service", "Start service", true)}
                </>
              ) : null}
              {booking.status === "in_service" ? (
                <>
                  <span />
                  {step("completed", "Complete", true)}
                </>
              ) : null}
            </div>
          </>
        ) : block ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing[3],
              }}
            >
              <div style={{ ...textStyle("title3"), color: colors.ink }}>Blocked time</div>
              <IconButton icon="close" label="Close" disabled={busy} onClick={onClose} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
              {row("Who", who(block.employeeId))}
              {row(
                "When",
                `${dayLabel(block.date)}, ${timeLabel(block.start)} to ${timeLabel(block.end)}`,
              )}
              {row("Reason", BLOCK_REASON_LABELS[block.reason])}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[2] }}>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void run(() => onRemoveBlock(block))}
              >
                Free this time
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
