"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, IconButton, Modal, textStyle } from "@zenzoo/ui-web";
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
import { dayLabel, durationLabel, timeLabel } from "./slotTime";

interface BookingDetailModalProps {
  /** One of these is open; both null means closed. */
  booking: Booking | null;
  block: TimeBlock | null;
  employees: Employee[];
  onClose: () => void;
  onStatus: (booking: Booking, status: BookingStatus) => Promise<void>;
  onRemoveBlock: (block: TimeBlock) => Promise<void>;
}

/** What a click on the calendar opens: the booking with the next step on it, or the blocked time. */
export default function BookingDetailModal({
  booking,
  block,
  employees,
  onClose,
  onStatus,
  onRemoveBlock,
}: BookingDetailModalProps) {
  const { colors, spacing } = useTheme();
  const { busy, run } = useSingleFlight();
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
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: spacing[2],
              }}
            >
              {booking.status === "booked" ? (
                <>
                  <div style={{ display: "flex", gap: spacing[2], flexWrap: "wrap" }}>
                    {step("cancelled", "Cancel booking")}
                    {step("no_show", "No-show")}
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
