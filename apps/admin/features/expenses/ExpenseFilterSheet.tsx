"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Chips, DatePicker, MultiChips, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { datePresets } from "../../lib/date-ranges";
import { PAYMENT_ACCOUNT_OPTIONS } from "../../lib/payment-options";
import FormField from "../../components/FormField";

export interface ExpenseFilters {
  /** Categories to show; empty means every category. */
  categories: string[];
  /** Accounts the money was paid from to show; empty means every account. */
  accounts: string[];
  /** ISO dates, YYYY-MM-DD, or "" for no limit on that side. */
  from: string;
  to: string;
}

export const NO_EXPENSE_FILTERS: ExpenseFilters = {
  categories: [],
  accounts: [],
  from: "",
  to: "",
};

interface ExpenseFilterSheetProps {
  open: boolean;
  filters: ExpenseFilters;
  /** Every category that can be picked. */
  categories: string[];
  onClose: () => void;
  onApply: (filters: ExpenseFilters) => void;
}

/** The expense filters in a side panel: the timeline, the categories, and the account paid from. */
export default function ExpenseFilterSheet({
  open,
  filters,
  categories,
  onClose,
  onApply,
}: ExpenseFilterSheetProps) {
  const { colors, spacing } = useTheme();
  const [draft, setDraft] = useState<ExpenseFilters>(filters);

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
            onClick={() => setDraft(NO_EXPENSE_FILTERS)}
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
            <FormField id="expense-filter-from" label="FROM" span={1}>
              <DatePicker
                id="expense-filter-from"
                value={draft.from}
                placeholder="Any date"
                max={draft.to || undefined}
                onChange={(from) => setDraft((current) => ({ ...current, from }))}
              />
            </FormField>
            <FormField
              id="expense-filter-to"
              label="TO"
              span={1}
              error={backwards ? "Must be after the start date." : null}
            >
              <DatePicker
                id="expense-filter-to"
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
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Category</div>
          <MultiChips
            aria-label="Categories"
            options={categories.map((name) => ({ value: name, label: name }))}
            value={draft.categories}
            columns={2}
            onChange={(next) => setDraft((current) => ({ ...current, categories: next }))}
          />
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            {draft.categories.length === 0
              ? "Showing every category."
              : "Pick as many as you like."}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
          <div style={{ ...textStyle("headline"), color: colors.ink }}>Paid from</div>
          <MultiChips
            aria-label="Accounts the money was paid from"
            options={PAYMENT_ACCOUNT_OPTIONS}
            value={draft.accounts}
            columns={2}
            onChange={(next) => setDraft((current) => ({ ...current, accounts: next }))}
          />
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            {draft.accounts.length === 0 ? "Showing every account." : "Pick as many as you like."}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
