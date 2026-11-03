"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, IconButton, Input, Modal, Switch, textStyle } from "@zenzoo/ui-web";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FormField from "../../components/FormField";
import FormSection from "../../components/FormSection";
import type { PricingMode } from "../../lib/catalogue-items";
import type { Employee } from "../employees/employees";
import type { SetupForm } from "./serviceSetup";

interface ServiceSetupFieldsProps {
  /** Who can be offered as a provider: the employees who are active. */
  employees: Employee[];
  value: SetupForm;
  onChange: (next: SetupForm) => void;
  /** The service's own price, used while not customised. */
  pricing: PricingMode;
  onPricingChange: (next: PricingMode) => void;
  price: string;
  onPriceChange: (next: string) => void;
  priceError?: string | null;
  /** Why the time or the employees' terms can't be saved yet. */
  error?: string | null;
}

const numbersOnly = /^\d*\.?\d{0,2}$/;
const digitsOnly = /^\d*$/;
const REMOVE_WIDTH = 40;

/**
 * Catalogue form section for what a service costs and how long it takes: one price and time for
 * everyone, or - after "Customise per employee" - a price and time for each employee added.
 */
export default function ServiceSetupFields({
  employees,
  value,
  onChange,
  pricing,
  onPricingChange,
  price,
  onPriceChange,
  priceError = null,
  error = null,
}: ServiceSetupFieldsProps) {
  const { colors, radius, spacing } = useTheme();
  // The list of employees to add opens under the button.
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  // The list closes on a click anywhere else, and starts empty of a search each time it opens.
  useEffect(() => {
    if (!picking) {
      setSearch("");
      return;
    }
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPicking(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picking]);
  // Going back to one price for everyone throws the employees' terms away, so it is asked first.
  const [confirmingReset, setConfirmingReset] = useState(false);
  const columns = `minmax(0, 1fr) 130px 110px ${REMOVE_WIDTH}px`;

  const added = employees.filter((employee) => value.rows[employee.id]?.on);
  // Only the people not added yet can be picked from the list.
  const addable = useMemo(
    () =>
      employees
        .filter((employee) => !value.rows[employee.id]?.on)
        .map((employee) => ({
          value: employee.id,
          label: `${employee.name} · ${employee.jobRole}`,
        })),
    [employees, value.rows],
  );
  const matches = addable.filter((option) =>
    option.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const setRow = (
    id: string,
    patch: Partial<{ price: string; custom: boolean; minutes: string }>,
  ) =>
    onChange({
      ...value,
      rows: { ...value.rows, [id]: { ...value.rows[id]!, ...patch } },
    });

  function addProvider(id: string) {
    if (id === "") return;
    onChange({
      ...value,
      rows: {
        ...value.rows,
        [id]: { on: true, price: "", custom: pricing === "custom", minutes: "" },
      },
    });
  }

  // One switch for the whole list: every employee's price is agreed at the till, or none is.
  function setAllCustom(on: boolean) {
    onPricingChange(on ? "custom" : "fixed");
    onChange({
      ...value,
      rows: Object.fromEntries(
        Object.entries(value.rows).map(([id, row]) => [id, { ...row, custom: on }]),
      ),
    });
  }

  function useSameForEveryone() {
    onChange({ ...value, customised: false, rows: {} });
    setConfirmingReset(false);
    setPicking(false);
  }

  function removeProvider(id: string) {
    const { [id]: _removed, ...rest } = value.rows;
    onChange({ ...value, rows: rest });
  }

  return (
    <FormSection
      title="Price and time"
      action={
        value.customised ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: spacing[2] }}>
            <label
              htmlFor="customised-custom-price"
              style={{ ...textStyle("callout"), color: colors.ink }}
            >
              Custom price
            </label>
            <Switch
              id="customised-custom-price"
              checked={pricing === "custom"}
              onChange={setAllCustom}
            />
          </span>
        ) : null
      }
    >
      {!value.customised ? (
        <>
          <div
            style={{
              gridColumn: "span 12",
              display: "flex",
              flexDirection: "column",
              gap: spacing[2],
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing[3],
              }}
            >
              <label
                htmlFor="catalogue-price"
                style={{ ...textStyle("caption"), color: colors.inkMuted }}
              >
                PRICE (₹)
              </label>
              <span style={{ display: "inline-flex", alignItems: "center", gap: spacing[2] }}>
                <label
                  htmlFor="catalogue-custom-price"
                  style={{ ...textStyle("callout"), color: colors.ink }}
                >
                  Custom price
                </label>
                <Switch
                  id="catalogue-custom-price"
                  checked={pricing === "custom"}
                  onChange={(on) => onPricingChange(on ? "custom" : "fixed")}
                />
              </span>
            </div>
            <Input
              id="catalogue-price"
              inputMode="decimal"
              autoComplete="off"
              disabled={pricing === "custom"}
              placeholder={pricing === "custom" ? "Custom per order" : "0.00"}
              value={pricing === "custom" ? "" : price}
              aria-invalid={priceError ? true : undefined}
              onChange={(event) => {
                if (numbersOnly.test(event.target.value)) onPriceChange(event.target.value);
              }}
            />
            {priceError ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {priceError}
              </div>
            ) : null}
          </div>

          <FormField
            id="service-minutes"
            label="TIME TO COMPLETE (MINUTES, OPTIONAL)"
            span={12}
            error={error}
          >
            <Input
              id="service-minutes"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              placeholder="e.g. 45"
              value={value.minutes}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                if (digitsOnly.test(event.target.value))
                  onChange({ ...value, minutes: event.target.value });
              }}
            />
          </FormField>

          <div style={{ gridColumn: "span 12" }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onChange({ ...value, customised: true })}
            >
              Customise per employee
            </Button>
          </div>
        </>
      ) : (
        <div style={{ gridColumn: "span 12", display: "flex", flexDirection: "column" }}>
          {employees.length === 0 ? (
            <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
              No active employees yet. <Link href="/employees">Add employees</Link> to offer them
              here.
            </div>
          ) : (
            <>
              {added.length > 0 ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: columns,
                      columnGap: spacing[4],
                      alignItems: "center",
                      paddingTop: spacing[3],
                      paddingBottom: spacing[3],
                      ...textStyle("caption"),
                      color: colors.inkMuted,
                    }}
                  >
                    <span>EMPLOYEE</span>
                    <span>PRICE (₹)</span>
                    <span>TIME (MIN)</span>
                    <span />
                  </div>
                  {added.map((employee) => {
                    const current = value.rows[employee.id]!;
                    return (
                      <div
                        key={employee.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: columns,
                          columnGap: spacing[4],
                          alignItems: "center",
                          minHeight: 76,
                          borderTop: `1px solid ${colors.border}`,
                        }}
                      >
                        <span style={{ ...textStyle("body"), color: colors.ink, minWidth: 0 }}>
                          {employee.name}
                          <span
                            style={{
                              ...textStyle("footnote"),
                              color: colors.inkMuted,
                              display: "block",
                            }}
                          >
                            {employee.jobRole}
                          </span>
                        </span>
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={current.custom}
                          aria-label={`${employee.name} price`}
                          placeholder={current.custom ? "At till" : "0.00"}
                          value={current.custom ? "" : current.price}
                          aria-invalid={
                            error && !current.custom && !(Number(current.price) > 0)
                              ? true
                              : undefined
                          }
                          onChange={(event) => {
                            if (numbersOnly.test(event.target.value))
                              setRow(employee.id, { price: event.target.value });
                          }}
                        />
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={3}
                          aria-label={`${employee.name} time in minutes`}
                          placeholder="e.g. 45"
                          value={current.minutes}
                          onChange={(event) => {
                            if (digitsOnly.test(event.target.value))
                              setRow(employee.id, { minutes: event.target.value });
                          }}
                        />
                        <IconButton
                          icon="close"
                          label={`Remove ${employee.name}`}
                          onClick={() => removeProvider(employee.id)}
                        />
                      </div>
                    );
                  })}
                </>
              ) : null}

              <div
                ref={pickerRef}
                style={{
                  borderTop: added.length > 0 ? `1px solid ${colors.border}` : "none",
                  paddingTop: added.length > 0 ? spacing[6] : 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing[3],
                  }}
                >
                  {addable.length === 0 ? (
                    <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      Everyone is added.
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={picking}
                      onClick={() => setPicking((open) => !open)}
                      style={{
                        ...textStyle("bodyMedium"),
                        display: "inline-flex",
                        alignItems: "center",
                        gap: spacing[2],
                        padding: 0,
                        border: "none",
                        backgroundColor: "transparent",
                        cursor: "pointer",
                        color: colors.accent,
                      }}
                    >
                      <span aria-hidden="true">+</span>
                      {added.length === 0 ? "Add an employee" : "Add another employee"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(false);
                      setConfirmingReset(true);
                    }}
                    style={{
                      ...textStyle("bodyMedium"),
                      display: "inline-flex",
                      alignItems: "center",
                      gap: spacing[2],
                      padding: 0,
                      border: "none",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                      color: colors.inkMuted,
                    }}
                  >
                    Same for everyone
                  </button>
                </div>
                {picking && addable.length > 0 ? (
                  <div
                    style={{
                      marginTop: spacing[2],
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.lg,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{ padding: spacing[2], borderBottom: `1px solid ${colors.border}` }}
                    >
                      <Input
                        type="search"
                        autoFocus
                        autoComplete="off"
                        placeholder="Search employees"
                        aria-label="Search employees"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            // The sheet around this closes on Escape too; this closes only the list.
                            event.preventDefault();
                            event.stopPropagation();
                            setPicking(false);
                          } else if (event.key === "Enter") {
                            event.preventDefault();
                            const first = matches[0];
                            if (first) {
                              addProvider(first.value);
                              setPicking(false);
                            }
                          }
                        }}
                      />
                    </div>
                    <div role="listbox" style={{ maxHeight: 240, overflowY: "auto" }}>
                      {matches.length === 0 ? (
                        <div
                          style={{
                            ...textStyle("callout"),
                            color: colors.inkMuted,
                            padding: `${spacing[3]}px ${spacing[4]}px`,
                          }}
                        >
                          No employee matches.
                        </div>
                      ) : null}
                      {matches.map((option, index) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => {
                            addProvider(option.value);
                            setPicking(false);
                          }}
                          style={{
                            ...textStyle("body"),
                            display: "block",
                            width: "100%",
                            padding: `${spacing[3]}px ${spacing[4]}px`,
                            textAlign: "left",
                            color: colors.ink,
                            backgroundColor: "transparent",
                            border: "none",
                            borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
                            cursor: "pointer",
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {error ? (
                <div
                  role="alert"
                  style={{ ...textStyle("footnote"), color: colors.danger, paddingTop: spacing[2] }}
                >
                  {error}
                </div>
              ) : null}
            </>
          )}
          <Modal open={confirmingReset} onClose={() => setConfirmingReset(false)}>
            <div style={{ width: 420, maxWidth: "100%" }}>
              <div style={{ ...textStyle("title3"), color: colors.ink }}>
                Use the same price and time for everyone?
              </div>
              <div
                style={{ ...textStyle("callout"), color: colors.inkMuted, marginTop: spacing[2] }}
              >
                All the employee pricing will be removed. Are you sure?
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: spacing[3],
                  marginTop: spacing[6],
                }}
              >
                <Button type="button" variant="secondary" onClick={() => setConfirmingReset(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="danger" onClick={useSameForEveryone}>
                  Remove and continue
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </FormSection>
  );
}
