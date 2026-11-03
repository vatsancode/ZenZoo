"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, IconButton, Modal, Select, Switch, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState, type ReactNode } from "react";
import {
  rangesOf,
  WEEK_ORDER,
  WEEKDAY_NAMES,
  type DayHours,
  type Span,
  type WeekHours,
} from "./businessHours";
import { timeLabel } from "./slotTime";

interface BusinessHoursModalProps {
  open: boolean;
  /** The week to start from each time it opens. */
  initial: () => WeekHours;
  title?: string;
  description?: string;
  saveLabel?: string;
  onClose: () => void;
  onSave: (week: WeekHours) => void;
}

// The Switch is 48px wide; extra rows indent past it and the day name.
const SWITCH_WIDTH = 48;
// Up to four stretches on one day: the first and three more.
const MAX_EXTRA = 3;

// Half-hour choices across the whole day, from 12:00 AM to midnight at the end.
const TIME_OPTIONS = Array.from({ length: 49 }, (_, index) => {
  const minutes = index * 30;
  return {
    value: String(minutes),
    label: minutes === 1440 ? "12:00 AM (midnight)" : timeLabel(minutes),
  };
});

/** Opening and closing time for each weekday, with a switch to close a day altogether. */
export default function BusinessHoursModal({
  open,
  initial,
  title = "Business hours",
  description = "Switch a day off to close it. Nobody can be booked outside these hours.",
  saveLabel = "Save hours",
  onClose,
  onSave,
}: BusinessHoursModalProps) {
  const { colors, spacing } = useTheme();
  const [week, setWeek] = useState<WeekHours>(() => initial());

  // Each time it opens, start from what is saved.
  useEffect(() => {
    if (open)
      setWeek(initial().map((day) => ({ ...day, extra: day.extra?.map((span) => ({ ...span })) })));
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const change = (index: number, patch: Partial<DayHours>) =>
    setWeek((current) => current.map((day, i) => (i === index ? { ...day, ...patch } : day)));

  const setExtra = (index: number, at: number, patch: Partial<Span>) =>
    setWeek((current) =>
      current.map((day, i) =>
        i === index
          ? { ...day, extra: (day.extra ?? []).map((s, j) => (j === at ? { ...s, ...patch } : s)) }
          : day,
      ),
    );

  // A new stretch starts where the last one ends and runs two hours (or to midnight).
  const addExtra = (index: number) =>
    setWeek((current) =>
      current.map((day, i) => {
        if (i !== index) return day;
        const spans = rangesOf(day);
        const last = spans[spans.length - 1];
        const open = Math.min(last?.close ?? day.close, 1440 - 30);
        return {
          ...day,
          extra: [...(day.extra ?? []), { open, close: Math.min(open + 120, 1440) }],
        };
      }),
    );

  const removeExtra = (index: number, at: number) =>
    setWeek((current) =>
      current.map((day, i) =>
        i === index ? { ...day, extra: (day.extra ?? []).filter((_, j) => j !== at) } : day,
      ),
    );

  const invalid = week.some((day) => rangesOf(day).some((span) => span.close <= span.open));
  // Stretches on the same day mustn't run into each other.
  const overlapping = week.some((day) => {
    const spans = [...rangesOf(day)].sort((a, b) => a.open - b.open);
    return spans.some((span, i) => i > 0 && span.open < (spans[i - 1]?.close ?? 0));
  });
  const allClosed = week.every((day) => day.closed);

  return (
    <Modal open={open} onClose={onClose}>
      <div
        style={{
          width: 560,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: spacing[5],
        }}
      >
        <div>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>{title}</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            {description}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
          {WEEK_ORDER.map((index) => {
            const day = week[index];
            const name = WEEKDAY_NAMES[index] ?? "";
            if (!day) return null;
            const range = (
              span: Span,
              label: string,
              onChange: (patch: Partial<Span>) => void,
              action: ReactNode,
            ) => (
              <div style={{ display: "flex", alignItems: "center", gap: spacing[2], flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <Select
                    aria-label={`${label} opens`}
                    options={TIME_OPTIONS}
                    value={String(span.open)}
                    searchable={false}
                    onChange={(next) => onChange({ open: Number(next) })}
                  />
                </div>
                <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>to</span>
                <div style={{ flex: 1 }}>
                  <Select
                    aria-label={`${label} closes`}
                    options={TIME_OPTIONS}
                    value={String(span.close)}
                    searchable={false}
                    onChange={(next) => onChange({ close: Number(next) })}
                  />
                </div>
                {action}
              </div>
            );
            const lastClose = rangesOf(day).at(-1)?.close ?? 0;
            return (
              <div
                key={index}
                style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: spacing[3], minHeight: 44 }}
                >
                  <Switch
                    checked={!day.closed}
                    aria-label={`${name} is open`}
                    onChange={(on) => change(index, { closed: !on })}
                  />
                  <span
                    style={{
                      ...textStyle("callout"),
                      color: day.closed ? colors.inkMuted : colors.ink,
                      width: 100,
                    }}
                  >
                    {name}
                  </span>
                  {day.closed ? (
                    <span style={{ ...textStyle("callout"), color: colors.inkMuted }}>Closed</span>
                  ) : (
                    range(
                      { open: day.open, close: day.close },
                      name,
                      (patch) => change(index, patch),
                      <IconButton
                        icon="plus"
                        label={`Add another time on ${name}`}
                        disabled={lastClose > 1440 - 30 || (day.extra?.length ?? 0) >= MAX_EXTRA}
                        onClick={() => addExtra(index)}
                      />,
                    )
                  )}
                </div>
                {day.closed
                  ? null
                  : (day.extra ?? []).map((span, at) => (
                      <div
                        key={at}
                        style={{ display: "flex", alignItems: "center", gap: spacing[3] }}
                      >
                        <div style={{ width: SWITCH_WIDTH + 100 + spacing[3] }} />
                        {range(
                          span,
                          `${name} extra ${at + 1}`,
                          (patch) => setExtra(index, at, patch),
                          <IconButton
                            icon="trash"
                            label={`Remove this time on ${name}`}
                            onClick={() => removeExtra(index, at)}
                          />,
                        )}
                      </div>
                    ))}
              </div>
            );
          })}
        </div>

        {invalid ? (
          <div style={{ ...textStyle("footnote"), color: colors.danger }}>
            Closing time must be after opening time.
          </div>
        ) : null}
        {overlapping ? (
          <div style={{ ...textStyle("footnote"), color: colors.danger }}>
            Times on the same day can&apos;t overlap.
          </div>
        ) : null}
        {allClosed ? (
          <div style={{ ...textStyle("footnote"), color: colors.danger }}>
            Keep at least one day open.
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[2] }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={invalid || overlapping || allClosed}
            onClick={() => onSave(week)}
          >
            {saveLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
