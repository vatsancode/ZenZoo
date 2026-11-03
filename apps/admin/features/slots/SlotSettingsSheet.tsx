"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Icon, Sheet, textStyle } from "@zenzoo/ui-web";
import { useState } from "react";
import type { Employee } from "../employees/employees";
import BlockSlotsModal from "./BlockSlotsModal";
import BusinessHoursModal from "./BusinessHoursModal";
import SlotSizeModal from "./SlotSizeModal";
import {
  getBusinessHours,
  getWorkHours,
  saveWorkHours,
  getSlotMinutes,
  saveBusinessHours,
  saveSlotMinutes,
  summarise,
  type WeekHours,
} from "./businessHours";
import { timeLabel } from "./slotTime";

interface SlotSettingsSheetProps {
  open: boolean;
  /** One employee's settings; null for the settings that apply to everyone. */
  employee: Employee | null;
  /** Everyone who can be blocked from the shop-wide settings. */
  employees: Employee[];
  calendarDate: string;
  onClose: () => void;
  /** A shop setting was saved; the message says which. */
  onSaved: (message: string) => void;
  /** Time was blocked; the message says what happened. */
  onBlocked: (message: string) => void;
}

/** The place for slot settings: the shop's from the top of the page, one person's from their column. */
export default function SlotSettingsSheet({
  open,
  employee,
  employees,
  calendarDate,
  onClose,
  onSaved,
  onBlocked,
}: SlotSettingsSheetProps) {
  const { colors, radius, spacing } = useTheme();
  const [popup, setPopup] = useState<"hours" | "work" | "block" | "slot" | null>(null);

  const divider = <div style={{ height: 1, backgroundColor: colors.border }} />;

  const section = (
    title: string,
    hint: string | null,
    label: string,
    detail: string,
    onOpen: () => void,
  ) => (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
      <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{title}</div>
      {hint ? <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{hint}</div> : null}
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[3],
          width: "100%",
          padding: `${spacing[3]}px ${spacing[4]}px`,
          marginTop: spacing[1],
          textAlign: "left",
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSunken,
          color: colors.ink,
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={textStyle("callout")}>{label}</span>
          <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{detail}</span>
        </span>
        <span
          style={{
            display: "inline-flex",
            flexShrink: 0,
            color: colors.inkMuted,
            transform: "rotate(-90deg)",
          }}
        >
          <Icon name="chevronDown" size={18} />
        </span>
      </button>
    </div>
  );

  function saveSlotSize(minutes: number) {
    saveSlotMinutes(minutes);
    setPopup(null);
    onSaved("Slot size saved.");
  }

  function saveWork(week: WeekHours) {
    if (!employee) return;
    saveWorkHours(employee.id, week);
    setPopup(null);
    onSaved(`${employee.name}'s work hours saved.`);
  }

  function saveHours(week: WeekHours) {
    saveBusinessHours(week);
    setPopup(null);
    onSaved("Business hours saved.");
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={employee ? `${employee.name}: slot settings` : "Slot settings"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
          {employee ? null : (
            <>
              {section(
                "Business hours",
                null,
                "Set business hours",
                summarise(getBusinessHours(), timeLabel),
                () => setPopup("hours"),
              )}
              {divider}
            </>
          )}
          {employee ? (
            <>
              {section(
                "Work hours",
                null,
                "Set work hours",
                getWorkHours(employee.id)
                  ? summarise(getWorkHours(employee.id) ?? [], timeLabel)
                  : "Same as business hours",
                () => setPopup("work"),
              )}
              {divider}
            </>
          ) : null}
          {section(
            "Block slots",
            null,
            employee ? `Block slots for ${employee.name}` : "Block slots for everyone",
            employee ? "Pick a date and time" : "Pick a date and time for all employees",
            () => setPopup("block"),
          )}
          {employee ? null : (
            <>
              {divider}
              {section("Slot size", null, "Set slot size", `${getSlotMinutes()} minutes`, () =>
                setPopup("slot"),
              )}
            </>
          )}
        </div>
      </Sheet>

      <BusinessHoursModal
        open={popup === "hours"}
        initial={getBusinessHours}
        onClose={() => setPopup(null)}
        onSave={saveHours}
      />
      <BusinessHoursModal
        open={popup === "work"}
        initial={() => (employee ? getWorkHours(employee.id) : null) ?? getBusinessHours()}
        title={employee ? `${employee.name}: work hours` : "Work hours"}
        description="Switch a day off to mark it as their day off."
        saveLabel="Save work hours"
        onClose={() => setPopup(null)}
        onSave={saveWork}
      />
      <SlotSizeModal open={popup === "slot"} onClose={() => setPopup(null)} onSave={saveSlotSize} />
      <BlockSlotsModal
        open={popup === "block"}
        employee={employee}
        employees={employees}
        calendarDate={calendarDate}
        onClose={() => setPopup(null)}
        onDone={(message) => {
          setPopup(null);
          onBlocked(message);
        }}
      />
    </>
  );
}
