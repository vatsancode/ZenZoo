"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Chips, DatePicker, MultiChips, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { PAYMENT_ACCOUNT_OPTIONS, listPaymentMethods, STORE_CREDIT } from "../lib/payment-options";
import { datePresets } from "../lib/date-ranges";
import FormField from "./FormField";

export interface SalesFilters {
  /** Payment method codes to show; empty means every method. */
  methods: string[];
  /** Accounts the money was received into to show; empty means every account. */
  accounts: string[];
  /** ISO dates, YYYY-MM-DD, or "" for no limit on that side. */
  from: string;
  to: string;
}

export const NO_FILTERS: SalesFilters = { methods: [], accounts: [], from: "", to: "" };

interface SalesFilterSheetProps {
  open: boolean;
  filters: SalesFilters;
  onClose: () => void;
  onApply: (filters: SalesFilters) => void;
}

// Store credit is not a payment method you can pick at the till, but it is a way a sale was paid.
// Every method ever used, including ones switched off since, so old sales can still be found.
// Store credit is not a method you can pick at the till, but it is a way a sale was paid.
const methodFilterOptions = () => [
  ...listPaymentMethods().map((method) => ({ value: method.value, label: method.label })),
  { value: STORE_CREDIT, label: "Store credit" },
];

/** The sales filters in a side panel: the timeline, and the payment method. */
export default function SalesFilterSheet({
  open,
  filters,
  onClose,
  onApply,
}: SalesFilterSheetProps) {
  const { colors, spacing } = useTheme();
  const [draft, setDraft] = useState<SalesFilters>(filters);

  // Each time the panel opens, start from what is currently applied.
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const ranges = datePresets();
  const activePreset = ranges.find((range) => range.from === draft.from && range.to === draft.to);
  const backwards = draft.from !== "" && draft.to !== "" && draft.from > draft.to;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      width={480}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDraft(NO_FILTERS)}
            style={{ flex: 1 }}
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={backwards}
            onClick={() => onApply(draft)}
            style={{ flex: 2 }}
          >
            Apply filters
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[8] }}>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Timeline</div>
          <Chips
            aria-label="Date range"
            options={ranges.map(({ id, label }) => ({ value: id, label }))}
            value={activePreset?.id ?? ""}
            columns={3}
            onChange={(id) => {
              const range = ranges.find((item) => item.id === id);
              if (range) setDraft((current) => ({ ...current, from: range.from, to: range.to }));
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              columnGap: spacing[4],
              alignItems: "start",
            }}
          >
            <FormField id="filter-from" label="FROM" span={1}>
              <DatePicker
                id="filter-from"
                value={draft.from}
                placeholder="Any date"
                max={draft.to || undefined}
                onChange={(from) => setDraft((current) => ({ ...current, from }))}
              />
            </FormField>
            <FormField
              id="filter-to"
              label="TO"
              span={1}
              error={backwards ? "Must be after the start date." : null}
            >
              <DatePicker
                id="filter-to"
                value={draft.to}
                placeholder="Any date"
                min={draft.from || undefined}
                align="right"
                onChange={(to) => setDraft((current) => ({ ...current, to }))}
              />
            </FormField>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Payment method</div>
          <MultiChips
            aria-label="Payment methods"
            options={methodFilterOptions()}
            value={draft.methods}
            columns={3}
            onChange={(methods) => setDraft((current) => ({ ...current, methods }))}
          />
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            {draft.methods.length === 0 ? "Showing every method." : "Pick as many as you like."}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Received into</div>
          <MultiChips
            aria-label="Accounts the money was received into"
            options={PAYMENT_ACCOUNT_OPTIONS}
            value={draft.accounts}
            columns={2}
            onChange={(accounts) => setDraft((current) => ({ ...current, accounts }))}
          />
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            {draft.accounts.length === 0 ? "Showing every account." : "Pick as many as you like."}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
