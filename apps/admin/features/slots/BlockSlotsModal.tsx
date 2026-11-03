"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, DatePicker, Modal, Select, Switch, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import FormField from "../../components/FormField";
import { useSingleFlight } from "../../lib/useSingleFlight";
import type { Employee } from "../employees/employees";
import { getSlotMinutes, gridBounds, hoursFor } from "./businessHours";
import { addBlocks, BLOCK_REASON_LABELS, type BlockReason } from "./bookings";
import { addDaysIso, timeLabel, todayIso } from "./slotTime";

interface BlockSlotsModalProps {
  open: boolean;
  /** One person's time to block; null blocks the same time for everyone. */
  employee: Employee | null;
  /** Everyone who can be blocked when `employee` is null. */
  employees: Employee[];
  /** The date the calendar is showing, offered as the starting point. */
  calendarDate: string;
  onClose: () => void;
  /** Some or all of the time was blocked; the message says what happened. */
  onDone: (message: string) => void;
}

// How far a repeating block runs when no last date is given, and the most it can run.
const REPEAT_DEFAULT_DAYS = 90;
const REPEAT_MAX_DAYS = 366;

const REASON_OPTIONS = (Object.keys(BLOCK_REASON_LABELS) as BlockReason[]).map((value) => ({
  value,
  label: BLOCK_REASON_LABELS[value],
}));

/** Blocks a stretch of one day for one employee, or for all of them at once. */
export default function BlockSlotsModal({
  open,
  employee,
  employees,
  calendarDate,
  onClose,
  onDone,
}: BlockSlotsModalProps) {
  const { colors, spacing } = useTheme();
  const { busy, run } = useSingleFlight();
  const today = todayIso();
  const { open: dayOpen, close: dayClose } = gridBounds();
  const STEP = getSlotMinutes();
  const timeOptions = Array.from(
    { length: Math.floor((dayClose - dayOpen) / STEP) + 1 },
    (_, index) => {
      const minutes = dayOpen + index * STEP;
      return { value: String(minutes), label: timeLabel(minutes) };
    },
  );

  const [date, setDate] = useState(calendarDate);
  const [from, setFrom] = useState(String(dayOpen));
  const [to, setTo] = useState(String(Math.min(dayOpen + 60, dayClose)));
  const [everyDay, setEveryDay] = useState(false);
  const [untilDate, setUntilDate] = useState("");
  const [reason, setReason] = useState<BlockReason>("break");
  const [error, setError] = useState<string | null>(null);

  // Each time it opens, start fresh.
  useEffect(() => {
    if (!open) return;
    setDate(calendarDate < today ? today : calendarDate);
    setFrom(String(dayOpen));
    setTo(String(Math.min(dayOpen + 60, dayClose)));
    setEveryDay(false);
    setUntilDate("");
    setReason("break");
    setError(null);
    // Only when it opens - not when the calendar moves behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const targets = employee ? [employee] : employees;
  // One person: a from date and an optional to date. Everyone: the same, behind "Every day".
  const showRange = employee !== null || everyDay;
  const invalid =
    Number(to) <= Number(from) || !date || (showRange && untilDate !== "" && untilDate < date);

  async function submit() {
    setError(null);
    // One day, or every day from the date to the last date (90 days on when none is given).
    const last = employee
      ? untilDate || date
      : everyDay
        ? untilDate || addDaysIso(date, REPEAT_DEFAULT_DAYS)
        : date;
    const days: string[] = [];
    for (let day = date; day <= last && days.length < REPEAT_MAX_DAYS; day = addDaysIso(day, 1)) {
      if (!hoursFor(day).closed) days.push(day);
    }
    if (days.length === 0) {
      setError("The shop is closed on every one of those days.");
      return;
    }
    const { created, skipped } = await addBlocks(
      targets.flatMap((person) =>
        days.map((day) => ({
          employeeId: person.id,
          date: day,
          start: Number(from),
          end: Number(to),
          reason,
        })),
      ),
    );
    if (created.length === 0) {
      setError("Everyone already has a booking in that time. Move or cancel it first.");
      return;
    }
    const where = employee
      ? employee.name
      : `${targets.length} ${targets.length === 1 ? "employee" : "employees"}`;
    const span = days.length === 1 ? "" : ` on ${days.length} days`;
    onDone(
      skipped.length === 0
        ? `Time blocked for ${where}${span}.`
        : `Time blocked for ${where}${span}. ${skipped.length} skipped because of existing bookings.`,
    );
  }

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose}>
      <div
        style={{
          width: 480,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: spacing[5],
        }}
      >
        <div>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>
            {employee ? `Block slots: ${employee.name}` : "Block slots for everyone"}
          </div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            {employee
              ? "Nobody can book this time with them."
              : "Nobody can book this time with any employee. Anyone already booked then is skipped."}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: spacing[4] }}>
          {employee ? null : (
            <div
              style={{
                gridColumn: "span 12",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing[3],
              }}
            >
              <label
                htmlFor="block-all-every-day"
                style={{ ...textStyle("callout"), color: colors.ink }}
              >
                Every day
              </label>
              <Switch id="block-all-every-day" checked={everyDay} onChange={setEveryDay} />
            </div>
          )}
          <FormField
            id="block-all-date"
            label={showRange ? "FROM DATE" : "DATE"}
            span={showRange ? 6 : 12}
          >
            <DatePicker
              id="block-all-date"
              value={date}
              onChange={setDate}
              min={today}
              clearable={false}
            />
          </FormField>
          {showRange ? (
            <FormField
              id="block-all-until"
              label="TO DATE (OPTIONAL)"
              span={6}
              hint={employee || untilDate ? null : `Repeats for ${REPEAT_DEFAULT_DAYS} days.`}
            >
              <DatePicker
                id="block-all-until"
                value={untilDate}
                onChange={setUntilDate}
                min={date}
              />
            </FormField>
          ) : null}
          <FormField id="block-all-from" label="FROM" span={6}>
            <Select
              id="block-all-from"
              options={timeOptions.slice(0, -1)}
              value={from}
              searchable={false}
              onChange={(next) => {
                setFrom(next);
                if (Number(to) <= Number(next))
                  setTo(String(Math.min(Number(next) + 30, dayClose)));
              }}
            />
          </FormField>
          <FormField id="block-all-to" label="TO" span={6}>
            <Select
              id="block-all-to"
              options={timeOptions.filter((item) => Number(item.value) > Number(from))}
              value={to}
              searchable={false}
              onChange={setTo}
            />
          </FormField>
          <FormField id="block-all-reason" label="REASON" span={12}>
            <Select
              id="block-all-reason"
              options={REASON_OPTIONS}
              value={reason}
              searchable={false}
              onChange={(next) => setReason(next as BlockReason)}
            />
          </FormField>
        </div>

        {error ? (
          <div style={{ ...textStyle("footnote"), color: colors.danger }}>{error}</div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[2] }}>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy || invalid || targets.length === 0}
            onClick={() => void run(submit)}
          >
            Block time
          </Button>
        </div>
      </div>
    </Modal>
  );
}
