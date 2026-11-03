"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Chips, DatePicker, Input, Select, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import FormField from "../../components/FormField";
import FormSection from "../../components/FormSection";
import { cleanPhoneInput } from "../settings/users";
import type { Customer } from "../../lib/customers";
import { formatPrice } from "../../lib/stock-display";
import { useSingleFlight } from "../../lib/useSingleFlight";
import EmployeeAvatar from "../employees/EmployeeAvatar";
import type { Employee } from "../employees/employees";
import { freeStarts, nextFree } from "./availability";
import { getSlotMinutes, gridBounds } from "./businessHours";
import {
  BLOCK_REASON_LABELS,
  holdsTime,
  type Booking,
  type BookingInput,
  type BlockReason,
  type TimeBlock,
  type TimeBlockInput,
} from "./bookings";
import ProviderPicker, { SlotChips, type ProviderChoice, type SlotOption } from "./ProviderPicker";
import { termsFor, type ServiceSetup } from "./serviceSetup";
import { addDaysIso, dayLabel, durationLabel, timeLabel, todayIso } from "./slotTime";

/** A made-to-order catalogue item that has been given a time and providers. */
export interface BookableService {
  id: string;
  name: string;
  /** The service's own price; undefined when it is priced at the till. */
  price?: number;
  setup: ServiceSetup;
}

export interface SlotPrefill {
  employeeId: string;
  date: string;
  start: number;
}

interface BookingSheetProps {
  open: boolean;
  /** The free time that was clicked on the calendar, if that is how the sheet was opened. */
  prefill: SlotPrefill | null;
  /** The day the calendar is showing. */
  calendarDate: string;
  services: BookableService[];
  employees: Employee[];
  bookings: Booking[];
  blocks: TimeBlock[];
  customers: Customer[];
  onClose: () => void;
  /** Resolve to an error message to show, or null when it went through. */
  onBook: (input: BookingInput) => Promise<string | null>;
  onBlock: (input: TimeBlockInput) => Promise<string | null>;
}

const MODE_OPTIONS = [
  { value: "book", label: "Book a service" },
  { value: "block", label: "Block time" },
];

const REASON_OPTIONS = (Object.keys(BLOCK_REASON_LABELS) as BlockReason[]).map((value) => ({
  value,
  label: BLOCK_REASON_LABELS[value],
}));

function timeOptions(open: number, close: number) {
  const STEP = getSlotMinutes();
  return Array.from({ length: Math.floor((close - open) / STEP) + 1 }, (_, index) => {
    const minutes = open + index * STEP;
    return { value: String(minutes), label: timeLabel(minutes) };
  });
}

const lastTen = (phone: string) => phone.replace(/\D/g, "").slice(-10);

export default function BookingSheet({
  open,
  prefill,
  calendarDate,
  services,
  employees,
  bookings,
  blocks,
  customers,
  onClose,
  onBook,
  onBlock,
}: BookingSheetProps) {
  const { colors, radius, spacing } = useTheme();
  const [mode, setMode] = useState("book");
  const [serviceId, setServiceId] = useState("");
  const [choice, setChoice] = useState("any");
  const [date, setDate] = useState(calendarDate);
  const [slotKey, setSlotKey] = useState("");
  // Opened from a free time: show who and when as a card until "Edit" is pressed (one way).
  const [editingWhen, setEditingWhen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [blockEmployee, setBlockEmployee] = useState("");
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  const [blockReason, setBlockReason] = useState<BlockReason>("break");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { busy: saving, run: runSave } = useSingleFlight();

  // Each time it opens, start fresh - from the clicked free time if there was one.
  useEffect(() => {
    if (!open) return;
    const day = prefill?.date ?? (calendarDate < todayIso() ? todayIso() : calendarDate);
    setMode("book");
    setServiceId("");
    setChoice(prefill?.employeeId ?? "any");
    setDate(day);
    setSlotKey("");
    setEditingWhen(false);
    setPhone("");
    setName("");
    setNote("");
    setBlockEmployee(prefill?.employeeId ?? employees[0]?.id ?? "");
    const { open: OPEN, close: CLOSE } = gridBounds();
    setBlockFrom(String(prefill?.start ?? OPEN));
    setBlockTo(String(Math.min((prefill?.start ?? OPEN) + 30, CLOSE)));
    setBlockReason("break");
    setTouched(false);
    setSubmitError(null);
    // Only when it opens - not when the lists refresh behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const service = services.find((item) => item.id === serviceId) ?? null;
  const byId = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);

  // Opened from a free time: only the services that employee does.
  const serviceOptions = useMemo(
    () =>
      services
        .filter((item) => !prefill || termsFor(item.setup, prefill.employeeId, item.price) !== null)
        .map((item) => ({ value: item.id, label: item.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [services, prefill],
  );

  // Everyone who does the chosen service, with what they charge and how long they take.
  const providers = useMemo(() => {
    if (!service) return [];
    return employees.flatMap((employee) => {
      const terms = termsFor(service.setup, employee.id, service.price);
      return terms ? [{ employee, ...terms }] : [];
    });
  }, [service, employees]);

  const today = todayIso();
  const { open: OPEN, close: CLOSE } = gridBounds();
  const TIME_OPTIONS = timeOptions(OPEN, CLOSE);
  const choices: ProviderChoice[] = useMemo(() => {
    if (!service) return [];
    const withNext = providers.map((provider) => ({
      ...provider,
      next: nextFree(provider.employee.id, today, provider.minutes, bookings, blocks),
    }));
    const nextText = (next: { date: string; start: number } | null) =>
      next ? `${dayLabel(next.date)} ${timeLabel(next.start)}` : "no free time soon";
    const prices = withNext.flatMap((item) => (item.price === undefined ? [] : [item.price]));
    const from = prices.length > 0 ? Math.min(...prices) : undefined;
    const earliest = withNext
      .flatMap((item) => (item.next ? [item.next] : []))
      .sort((a, b) =>
        (a.date + String(a.start).padStart(4, "0")).localeCompare(
          b.date + String(b.start).padStart(4, "0"),
        ),
      )[0];
    const priceText = (price: number | undefined) =>
      price === undefined ? "Price at the till" : formatPrice(price);
    const list: ProviderChoice[] = [];
    if (!prefill) {
      list.push({
        id: "any",
        title: "Any available",
        detail: `${from === undefined ? "Price at the till" : `From ${formatPrice(from)}`} · next ${nextText(earliest ?? null)}`,
        leading: <EmployeeAvatar name="Any" size={36} />,
      });
    }
    for (const item of withNext) {
      if (prefill && item.employee.id !== prefill.employeeId) continue;
      list.push({
        id: item.employee.id,
        title: item.employee.name,
        detail: `${priceText(item.price)} · ${durationLabel(item.minutes)} · next ${nextText(item.next)}`,
        leading: (
          <EmployeeAvatar name={item.employee.name} photoUrl={item.employee.photoUrl} size={36} />
        ),
      });
    }
    return list;
  }, [service, providers, bookings, blocks, today, prefill]);

  // The free times on the chosen day: one provider's, or everyone's when "Any available".
  const slots = useMemo(() => {
    const chosen =
      choice === "any" ? providers : providers.filter((item) => item.employee.id === choice);
    const prices = new Set(chosen.map((item) => item.price));
    const showWho = choice === "any" && prices.size > 1;
    const dayLoad = (employeeId: string) =>
      bookings.filter((row) => holdsTime(row) && row.employeeId === employeeId && row.date === date)
        .length;
    const found = chosen.flatMap((item) =>
      freeStarts(item.employee.id, date, item.minutes, bookings, blocks).map((start) => ({
        start,
        provider: item,
      })),
    );
    const picked = showWho
      ? found
      : // Same price for everyone: one chip per time, given to whoever is least busy that day.
        [...new Set(found.map((item) => item.start))].map(
          (start) =>
            found
              .filter((item) => item.start === start)
              .sort(
                (a, b) => dayLoad(a.provider.employee.id) - dayLoad(b.provider.employee.id),
              )[0]!,
        );
    return picked
      .sort((a, b) => a.start - b.start || (a.provider.price ?? 0) - (b.provider.price ?? 0))
      .map((item) => ({
        key: `${item.provider.employee.id}@${item.start}`,
        start: item.start,
        employeeId: item.provider.employee.id,
        minutes: item.provider.minutes,
        price: item.provider.price,
        option: {
          key: `${item.provider.employee.id}@${item.start}`,
          label: timeLabel(item.start),
          sub: showWho
            ? `${item.provider.employee.name.split(" ")[0]} · ${item.provider.price === undefined ? "at till" : formatPrice(item.provider.price)}`
            : undefined,
        } satisfies SlotOption,
      }));
  }, [choice, providers, date, bookings, blocks]);

  const slot = slots.find((item) => item.key === slotKey) ?? null;
  // The clicked time still fits this service, so who and when are already known.
  const showSummary =
    prefill !== null &&
    !editingWhen &&
    slot !== null &&
    slot.key === `${prefill.employeeId}@${prefill.start}` &&
    date === prefill.date;
  const summaryPerson = prefill ? byId.get(prefill.employeeId) : undefined;
  const groups = [
    {
      title: "Morning",
      options: slots.filter((item) => item.start < 12 * 60).map((item) => item.option),
    },
    {
      title: "Afternoon",
      options: slots
        .filter((item) => item.start >= 12 * 60 && item.start < 17 * 60)
        .map((item) => item.option),
    },
    {
      title: "Evening",
      options: slots.filter((item) => item.start >= 17 * 60).map((item) => item.option),
    },
  ];

  function chooseService(id: string) {
    setServiceId(id);
    setChoice(prefill?.employeeId ?? "any");
    setSubmitError(null);
    const next = services.find((item) => item.id === id);
    if (!prefill || !next) {
      setSlotKey("");
      return;
    }
    // From a free time on the calendar: keep that time if this service fits there.
    const terms = termsFor(next.setup, prefill.employeeId, next.price);
    const fits =
      terms &&
      freeStarts(prefill.employeeId, prefill.date, terms.minutes, bookings, blocks).includes(
        prefill.start,
      );
    setSlotKey(fits ? `${prefill.employeeId}@${prefill.start}` : "");
  }

  function pickChoice(id: string) {
    setChoice(id);
    setSlotKey("");
  }

  function pickDate(next: string) {
    setDate(next);
    setSlotKey("");
  }

  function pickPhone(typed: string) {
    // Only what a phone number can hold: digits, spaces and a leading "+".
    const next = cleanPhoneInput(typed);
    setPhone(next);
    const match =
      lastTen(next).length >= 10
        ? customers.find((item) => item.phone && lastTen(item.phone) === lastTen(next))
        : undefined;
    if (match && name.trim() === "") setName(match.name);
  }

  const existing =
    lastTen(phone).length >= 10
      ? customers.find((item) => item.phone && lastTen(item.phone) === lastTen(phone))
      : undefined;

  const bookProblem = !service
    ? "Choose a service."
    : !slot
      ? "Choose a time."
      : lastTen(phone).length < 10
        ? "Enter the customer's mobile number."
        : name.trim() === ""
          ? "Enter the customer's name."
          : null;

  const from = Number(blockFrom);
  const to = Number(blockTo);
  const blockProblem =
    blockEmployee === ""
      ? "Choose who is unavailable."
      : to <= from
        ? "The end must be after the start."
        : null;

  function submit() {
    setTouched(true);
    const problem = mode === "book" ? bookProblem : blockProblem;
    if (problem) return;
    return runSave(async () => {
      if (mode === "book" && service && slot) {
        setSubmitError(
          await onBook({
            serviceId: service.id,
            serviceName: service.name,
            employeeId: slot.employeeId,
            date,
            start: slot.start,
            minutes: slot.minutes,
            price: slot.price ?? 0,
            customerName: name.trim(),
            customerPhone: phone.trim(),
            note: note.trim() || undefined,
          }),
        );
      } else {
        setSubmitError(
          await onBlock({
            employeeId: blockEmployee,
            date,
            start: from,
            end: to,
            reason: blockReason,
          }),
        );
      }
    });
  }

  const summary =
    mode === "book" && service && slot
      ? `${service.name} · ${byId.get(slot.employeeId)?.name ?? ""} · ${dayLabel(date)} ${timeLabel(slot.start)} · ${durationLabel(slot.minutes)} · ${slot.price === undefined ? "price at the till" : formatPrice(slot.price)}`
      : null;
  const shownProblem = touched ? (mode === "book" ? bookProblem : blockProblem) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New booking"
      width={560}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
          {summary ? (
            <div style={{ ...textStyle("callout"), color: colors.ink }}>{summary}</div>
          ) : null}
          {shownProblem || submitError ? (
            <div style={{ ...textStyle("footnote"), color: colors.danger }} role="alert">
              {submitError ?? shownProblem}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: spacing[3] }}>
            <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="booking-form"
              variant="primary"
              loading={saving}
              style={{ flex: 2 }}
            >
              {mode === "book" ? "Book" : "Block time"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="booking-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
          <Chips
            aria-label="What to do"
            options={MODE_OPTIONS}
            value={mode}
            columns={2}
            onChange={(next) => {
              setMode(next);
              setSubmitError(null);
              setTouched(false);
            }}
          />

          {mode === "book" ? (
            <>
              <FormSection title="Service" divider={false}>
                <FormField id="booking-service" label="SERVICE" span={12}>
                  <Select
                    id="booking-service"
                    options={serviceOptions}
                    value={serviceId}
                    placeholder={services.length === 0 ? "No services yet" : "Select a service"}
                    onChange={chooseService}
                  />
                </FormField>
                {services.length === 0 ? (
                  <div
                    style={{
                      gridColumn: "span 12",
                      ...textStyle("footnote"),
                      color: colors.inkMuted,
                    }}
                  >
                    Add a made-to-order item in Catalogue first.
                  </div>
                ) : null}
              </FormSection>

              {service ? (
                <>
                  {showSummary && slot && summaryPerson ? (
                    <FormSection
                      title="Appointment"
                      action={
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setEditingWhen(true)}
                        >
                          Edit
                        </Button>
                      }
                    >
                      <div
                        style={{
                          gridColumn: "span 12",
                          display: "flex",
                          alignItems: "center",
                          gap: spacing[3],
                          padding: `${spacing[3]}px ${spacing[4]}px`,
                          border: `1px solid ${colors.border}`,
                          borderRadius: radius.lg,
                          backgroundColor: colors.surfaceSunken,
                        }}
                      >
                        <EmployeeAvatar
                          name={summaryPerson.name}
                          photoUrl={summaryPerson.photoUrl}
                          size={36}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                            {summaryPerson.name}
                          </div>
                          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                            {dayLabel(date)}, {timeLabel(slot.start)} to{" "}
                            {timeLabel(slot.start + slot.minutes)} · {durationLabel(slot.minutes)}
                          </div>
                        </div>
                      </div>
                    </FormSection>
                  ) : (
                    <>
                      <FormSection title="Provider">
                        <div style={{ gridColumn: "span 12" }}>
                          <ProviderPicker choices={choices} value={choice} onChange={pickChoice} />
                        </div>
                      </FormSection>

                      <FormSection title="Date and time">
                        <div
                          style={{
                            gridColumn: "span 12",
                            display: "flex",
                            gap: spacing[2],
                            flexWrap: "wrap",
                          }}
                        >
                          {[today, addDaysIso(today, 1)].map((day) => (
                            <Button
                              key={day}
                              type="button"
                              variant="secondary"
                              onClick={() => pickDate(day)}
                              style={
                                date === day
                                  ? { backgroundColor: colors.accent, color: colors.onAccent }
                                  : undefined
                              }
                            >
                              {dayLabel(day)}
                            </Button>
                          ))}
                          <div style={{ width: 200 }}>
                            <DatePicker
                              value={date}
                              onChange={pickDate}
                              min={today}
                              clearable={false}
                              aria-label="Pick a date"
                            />
                          </div>
                        </div>
                        <div style={{ gridColumn: "span 12" }}>
                          {slots.length === 0 ? (
                            <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
                              Nothing free on {dayLabel(date)}. Try another day.
                            </div>
                          ) : (
                            <SlotChips groups={groups} value={slotKey} onChange={setSlotKey} />
                          )}
                        </div>
                      </FormSection>
                    </>
                  )}

                  <FormSection title="Customer">
                    <FormField id="booking-name" label="NAME" span={12}>
                      <Input
                        id="booking-name"
                        autoComplete="off"
                        maxLength={120}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </FormField>
                    <FormField
                      id="booking-phone"
                      label="MOBILE"
                      span={12}
                      hint={existing ? `Existing customer: ${existing.name}` : null}
                    >
                      <Input
                        id="booking-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="off"
                        maxLength={20}
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(event) => pickPhone(event.target.value)}
                      />
                    </FormField>
                    <FormField id="booking-note" label="NOTE (OPTIONAL)" span={12}>
                      <Input
                        id="booking-note"
                        autoComplete="off"
                        maxLength={200}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                    </FormField>
                  </FormSection>
                </>
              ) : null}
            </>
          ) : (
            <FormSection
              title="Block time"
              description="Nobody can book this time with them."
              divider={false}
            >
              <FormField id="block-employee" label="WHO IS UNAVAILABLE" span={12}>
                <Select
                  id="block-employee"
                  options={employees.map((item) => ({ value: item.id, label: item.name }))}
                  value={blockEmployee}
                  searchable
                  onChange={setBlockEmployee}
                />
              </FormField>
              <FormField id="block-date" label="DATE" span={12}>
                <DatePicker
                  id="block-date"
                  value={date}
                  onChange={setDate}
                  min={today}
                  clearable={false}
                />
              </FormField>
              <FormField id="block-from" label="FROM" span={6}>
                <Select
                  id="block-from"
                  options={TIME_OPTIONS.slice(0, -1)}
                  value={blockFrom}
                  searchable={false}
                  onChange={(next) => {
                    setBlockFrom(next);
                    if (Number(blockTo) <= Number(next))
                      setBlockTo(String(Math.min(Number(next) + 30, CLOSE)));
                  }}
                />
              </FormField>
              <FormField id="block-to" label="TO" span={6}>
                <Select
                  id="block-to"
                  options={TIME_OPTIONS.filter((item) => Number(item.value) > from)}
                  value={blockTo}
                  searchable={false}
                  onChange={setBlockTo}
                />
              </FormField>
              <FormField id="block-reason" label="REASON" span={12}>
                <Select
                  id="block-reason"
                  options={REASON_OPTIONS}
                  value={blockReason}
                  searchable={false}
                  onChange={(next) => setBlockReason(next as BlockReason)}
                />
              </FormField>
            </FormSection>
          )}
        </div>
      </form>
    </Sheet>
  );
}
