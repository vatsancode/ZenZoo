"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { IconButton, textStyle } from "@zenzoo/ui-web";
import { useEffect, useRef, useState } from "react";
import EmployeeAvatar from "../employees/EmployeeAvatar";
import type { Employee } from "../employees/employees";
import { getSlotMinutes, gridBounds, workRanges } from "./businessHours";
import {
  BLOCK_REASON_LABELS,
  holdsTime,
  type Booking,
  type BookingStatus,
  type TimeBlock,
} from "./bookings";
import { nowMinutes, timeLabel, todayIso } from "./slotTime";

interface DayGridProps {
  employees: Employee[];
  date: string;
  bookings: Booking[];
  blocks: TimeBlock[];
  /** While searching: which bookings match. The rest are dimmed. Omitted when not searching. */
  isMatch?: (booking: Booking) => boolean;
  /** A free quarter hour was clicked. */
  onEmptyClick: (employeeId: string, start: number) => void;
  onBookingClick: (booking: Booking) => void;
  /** The settings icon beside a person's name was clicked. */
  onSettingsClick: (employee: Employee) => void;
  onBlockClick: (block: TimeBlock) => void;
}

// The grid's geometry: one row per slot, and the narrowest a person's column may get.
const GUTTER_WIDTH = 72;
const COLUMN_MIN_WIDTH = 300;
const HEADER_HEIGHT = 64;
const BOTTOM_GAP = 32;
const SCROLLBAR_ROOM = 12;

/** One day as a column per employee, a row per quarter hour: bookings and blocked time laid over it. */
export default function DayGrid({
  employees,
  date,
  bookings,
  blocks,
  isMatch,
  onEmptyClick,
  onBookingClick,
  onSettingsClick,
  onBlockClick,
}: DayGridProps) {
  const { colors, radius, spacing } = useTheme();
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [now, setNow] = useState(() => nowMinutes());
  // The free slot the pointer is over: a dotted line marks it across every column.
  const [hovered, setHovered] = useState<number | null>(null);

  // Keep the current time line (and which slots have passed) moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMinutes()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Size the calendar from where it starts to the bottom of the window, with some air below.
  useEffect(() => {
    const fit = () => {
      const top = frame.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(360, window.innerHeight - top - BOTTOM_GAP));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const today = todayIso();
  // The calendar spans the longest day of the week; each day greys out what is outside its hours.
  const { open: OPEN, close: CLOSE } = gridBounds();
  const STEP = getSlotMinutes();
  const ROWS = Math.ceil((CLOSE - OPEN) / STEP);
  // A slot is 20px tall at 15 minutes, and grows or shrinks with the slot size within reason.
  const baseRowHeight = Math.min(48, Math.max(16, Math.round((STEP * 4) / 3)));
  // The calendar reaches the bottom of the window; when the day is shorter than that, the rows
  // stretch to fill it (less room for the horizontal scrollbar).
  const ROW_HEIGHT =
    height === null
      ? baseRowHeight
      : Math.max(baseRowHeight, Math.floor((height - HEADER_HEIGHT - SCROLLBAR_ROOM) / ROWS));
  const topOf = (minutes: number) => ((minutes - OPEN) / STEP) * ROW_HEIGHT;
  const showNow = date === today && now >= OPEN && now <= CLOSE;
  // Quarter hours that have already gone can't be booked.
  const passedBefore = date < today ? CLOSE : date === today ? now : 0;

  const statusColor: Record<BookingStatus, string> = {
    booked: colors.accent,
    in_service: colors.warning,
    completed: colors.success,
    cancelled: colors.danger,
    no_show: colors.danger,
  };

  // One label and one line per slot, so the times shown are exactly the times that can be booked.
  const hourMarks = Array.from({ length: ROWS + 1 }, (_, index) => OPEN + index * STEP).filter(
    (minutes) => minutes <= CLOSE,
  );
  const template = `${GUTTER_WIDTH}px repeat(${employees.length}, minmax(${COLUMN_MIN_WIDTH}px, 1fr))`;

  return (
    <div
      ref={frame}
      style={{
        overflow: "auto",
        height: height ?? undefined,
        scrollbarWidth: "thin",
        scrollbarColor: `${colors.border} transparent`,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <div
        onMouseMove={(event) => {
          // Which slot the pointer is over, worked out from where it is on the grid.
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top - HEADER_HEIGHT;
          const index = Math.floor(y / ROW_HEIGHT);
          if (x < GUTTER_WIDTH || y < 0 || index >= ROWS) {
            setHovered(null);
            return;
          }
          setHovered(OPEN + index * STEP);
        }}
        onMouseLeave={() => setHovered(null)}
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: template,
          minWidth: "fit-content",
        }}
      >
        {hovered !== null ? (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: GUTTER_WIDTH,
              right: 0,
              top: HEADER_HEIGHT + topOf(hovered) - 1,
              borderTop: `2px dotted ${colors.ink}`,
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        ) : null}
        <div
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            zIndex: 3,
            height: HEADER_HEIGHT,
            backgroundColor: colors.surfaceRaised,
            borderBottom: `1px solid ${colors.border}`,
          }}
        />
        {employees.map((employee) => (
          <div
            key={employee.id}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              height: HEADER_HEIGHT,
              display: "flex",
              alignItems: "center",
              gap: spacing[3],
              padding: `0 ${spacing[3]}px`,
              backgroundColor: colors.surfaceRaised,
              borderBottom: `1px solid ${colors.border}`,
              borderLeft: `1px solid ${colors.border}`,
            }}
          >
            <EmployeeAvatar name={employee.name} photoUrl={employee.photoUrl} size={36} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{employee.name}</div>
              <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                {employee.jobRole}
              </div>
            </div>
            <IconButton
              icon="settings"
              label={`${employee.name}: slot settings`}
              onClick={() => onSettingsClick(employee)}
            />
          </div>
        ))}

        <div
          style={{
            position: "sticky",
            left: 0,
            zIndex: 1,
            height: ROWS * ROW_HEIGHT,
            backgroundColor: colors.surfaceRaised,
          }}
        >
          {hourMarks.map((minutes) => (
            <span
              key={minutes}
              style={{
                ...textStyle("footnote"),
                position: "absolute",
                top: topOf(minutes) - 8,
                right: spacing[2],
                color: colors.inkMuted,
                backgroundColor: colors.surfaceRaised,
                display: minutes === OPEN ? "none" : "block",
              }}
            >
              {timeLabel(minutes)}
            </span>
          ))}
          {hovered !== null ? (
            <span
              aria-hidden="true"
              style={{
                ...textStyle("footnote"),
                position: "absolute",
                top: topOf(hovered) - 9,
                right: spacing[2],
                padding: `0 ${spacing[1]}px`,
                borderRadius: radius.sm,
                backgroundColor: colors.ink,
                color: colors.surfaceRaised,
                zIndex: 1,
              }}
            >
              {timeLabel(hovered)}
            </span>
          ) : null}
          {showNow ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: -4,
                top: topOf(now) - 4,
                width: 8,
                height: 8,
                borderRadius: radius.full,
                backgroundColor: colors.danger,
              }}
            />
          ) : null}
        </div>

        {employees.map((employee) => (
          <div
            key={employee.id}
            style={{
              position: "relative",
              height: ROWS * ROW_HEIGHT,
              borderLeft: `1px solid ${colors.border}`,
            }}
          >
            {Array.from({ length: ROWS }, (_, index) => {
              const start = OPEN + index * STEP;
              const past =
                start < passedBefore ||
                !workRanges(employee.id, date).some(
                  (range) => start >= range.open && start < range.close,
                );
              return (
                <button
                  key={start}
                  type="button"
                  disabled={past}
                  aria-label={`Book ${employee.name} at ${timeLabel(start)}`}
                  onClick={() => onEmptyClick(employee.id, start)}
                  onMouseEnter={(event) => {
                    if (!past) event.currentTarget.style.backgroundColor = colors.surfaceSunken;
                  }}
                  onMouseLeave={(event) => {
                    if (!past) event.currentTarget.style.backgroundColor = "transparent";
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    height: ROW_HEIGHT,
                    padding: 0,
                    border: "none",
                    borderTop: `1px solid ${colors.border}`,
                    backgroundColor: past ? colors.surfaceSunken : "transparent",
                    opacity: past ? 0.5 : 1,
                    cursor: past ? "default" : "pointer",
                  }}
                />
              );
            })}

            {showNow ? (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: topOf(now),
                  borderTop: `1px solid ${colors.danger}`,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            ) : null}

            {blocks
              .filter((block) => block.employeeId === employee.id && block.date === date)
              .map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => onBlockClick(block)}
                  style={{
                    ...textStyle("footnote"),
                    position: "absolute",
                    left: spacing[1],
                    right: spacing[1],
                    top: topOf(block.start),
                    height: ((block.end - block.start) / STEP) * ROW_HEIGHT - 2,
                    padding: `${spacing[1]}px ${spacing[2]}px`,
                    textAlign: "left",
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.md,
                    color: colors.inkMuted,
                    cursor: "pointer",
                    backgroundImage: `repeating-linear-gradient(135deg, ${colors.surfaceSunken}, ${colors.surfaceSunken} 6px, ${colors.border} 6px, ${colors.border} 7px)`,
                  }}
                >
                  {BLOCK_REASON_LABELS[block.reason]} · {timeLabel(block.start)} to{" "}
                  {timeLabel(block.end)}
                </button>
              ))}

            {bookings
              .filter(
                (booking) =>
                  holdsTime(booking) && booking.employeeId === employee.id && booking.date === date,
              )
              .map((booking) => {
                const height = (booking.minutes / STEP) * ROW_HEIGHT - 2;
                const dimmed = isMatch ? !isMatch(booking) : false;
                return (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => onBookingClick(booking)}
                    style={{
                      position: "absolute",
                      left: spacing[1],
                      right: spacing[1],
                      top: topOf(booking.start),
                      height,
                      overflow: "hidden",
                      padding: `${spacing[1]}px ${spacing[2]}px`,
                      textAlign: "left",
                      border: "none",
                      borderLeft: `4px solid ${statusColor[booking.status]}`,
                      borderRadius: radius.md,
                      backgroundColor: colors.surfaceSunken,
                      color: colors.ink,
                      opacity: dimmed ? 0.35 : 1,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ ...textStyle("bodyMedium"), whiteSpace: "nowrap" }}>
                      {booking.serviceName}
                    </div>
                    <div
                      style={{
                        ...textStyle("footnote"),
                        color: colors.inkMuted,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {height >= 60
                        ? `${timeLabel(booking.start)} · ${booking.customerName}`
                        : booking.customerName}
                    </div>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
