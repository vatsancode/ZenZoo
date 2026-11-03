"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, DatePicker, Input, Notice, Select, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import FormField from "../../components/FormField";
import { useSingleFlight } from "../../lib/useSingleFlight";
import type { TillPaymentOptions } from "../../lib/till";
import type { SalaryPaymentInput } from "./employees";

interface SalaryPaymentSheetProps {
  open: boolean;
  employeeName: string;
  /** The methods and accounts money can leave by; null while loading or when they couldn't be loaded. */
  options: TillPaymentOptions | null;
  /** The expense categories a payment can be filed under. */
  categories: { id: string; name: string }[];
  /** Loading the accounts, methods or categories failed. */
  optionsFailed: boolean;
  onClose: () => void;
  /** Saves the payment; resolves to an error message to show, or null when it went through. */
  onSubmit: (input: SalaryPaymentInput) => Promise<string | null>;
}

/** Today as YYYY-MM-DD in the browser's own timezone. */
function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Records a salary payment: how much, when, from which account, by which method, filed under which category. */
export default function SalaryPaymentSheet({
  open,
  employeeName,
  options,
  categories,
  optionsFailed,
  onClose,
  onSubmit,
}: SalaryPaymentSheetProps) {
  const { colors, spacing } = useTheme();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [accountId, setAccountId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { busy: saving, run: runSave } = useSingleFlight();

  const accountOptions = useMemo(
    () => (options?.accounts ?? []).map((item) => ({ value: item.id, label: item.name })),
    [options],
  );
  const methodOptions = useMemo(
    () => (options?.methods ?? []).map((item) => ({ value: item.id, label: item.name })),
    [options],
  );
  const categoryOptions = useMemo(
    () => categories.map((item) => ({ value: item.id, label: item.name })),
    [categories],
  );

  // Each time it opens, start fresh - with Salaries already chosen when the shop has that category.
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setPaidOn(todayIso());
    setAccountId("");
    setMethodId("");
    setCategoryId(categories.find((item) => item.name.toLowerCase() === "salaries")?.id ?? "");
    setNote("");
    setTouched(false);
    setSubmitError(null);
    // Only when it opens - not when the lists finish loading behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = amount.trim() === "" ? 0 : Number(amount);
  const errors = {
    amount: value > 0 ? null : "Enter the amount paid.",
    paidOn: paidOn === "" ? "Pick the date paid." : null,
    account: accountId === "" ? "Choose the account it was paid from." : null,
    method: methodId === "" ? "Choose how it was paid." : null,
    category: categoryId === "" ? "Choose an expense category." : null,
  };
  const valid = Object.values(errors).every((problem) => problem === null);
  const shown = (problem: string | null) => (touched ? problem : null);

  function submit() {
    setTouched(true);
    if (!valid) return;
    return runSave(async () => {
      setSubmitError(
        await onSubmit({
          paidOn,
          amount: value,
          account: accountOptions.find((item) => item.value === accountId)?.label ?? "",
          method: methodOptions.find((item) => item.value === methodId)?.label ?? "",
          category: categoryOptions.find((item) => item.value === categoryId)?.label ?? "",
          note,
        }),
      );
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Record salary payment"
      width={480}
      footer={
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="salary-payment-form"
            variant="primary"
            loading={saving}
            style={{ flex: 2 }}
          >
            Record payment
          </Button>
        </div>
      }
    >
      <form
        id="salary-payment-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
          <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
            Salary paid to {employeeName}. It is filed as an expense under the category you choose.
          </div>

          {optionsFailed ? (
            <Notice>
              Couldn&apos;t load the accounts and categories. Close this and try again.
            </Notice>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              columnGap: spacing[3],
              rowGap: spacing[6],
              alignItems: "start",
            }}
          >
            <FormField id="salary-amount" label="AMOUNT" span={6} error={shown(errors.amount)}>
              <Input
                id="salary-amount"
                autoFocus
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 20000"
                value={amount}
                aria-invalid={shown(errors.amount) ? true : undefined}
                onChange={(event) => {
                  if (/^\d*\.?\d{0,2}$/.test(event.target.value)) setAmount(event.target.value);
                }}
              />
            </FormField>
            <FormField id="salary-paid-on" label="PAID ON" span={6} error={shown(errors.paidOn)}>
              <DatePicker
                id="salary-paid-on"
                value={paidOn}
                onChange={setPaidOn}
                clearable={false}
                align="right"
                aria-invalid={shown(errors.paidOn) ? true : undefined}
              />
            </FormField>
            <FormField
              id="salary-account"
              label="PAID FROM (BANK OR CASH ACCOUNT)"
              span={12}
              error={shown(errors.account)}
            >
              <Select
                id="salary-account"
                options={accountOptions}
                value={accountId}
                placeholder="Select an account"
                searchable={false}
                aria-invalid={shown(errors.account) ? true : undefined}
                onChange={setAccountId}
              />
            </FormField>
            <FormField
              id="salary-method"
              label="PAYMENT METHOD"
              span={12}
              error={shown(errors.method)}
            >
              <Select
                id="salary-method"
                options={methodOptions}
                value={methodId}
                placeholder="Select a method"
                searchable={false}
                aria-invalid={shown(errors.method) ? true : undefined}
                onChange={setMethodId}
              />
            </FormField>
            <FormField
              id="salary-category"
              label="EXPENSE CATEGORY"
              span={12}
              error={shown(errors.category)}
            >
              <Select
                id="salary-category"
                options={categoryOptions}
                value={categoryId}
                placeholder="Select a category"
                aria-invalid={shown(errors.category) ? true : undefined}
                onChange={setCategoryId}
              />
            </FormField>
            <FormField id="salary-note" label="NOTE (OPTIONAL)" span={12}>
              <Input
                id="salary-note"
                autoComplete="off"
                maxLength={200}
                placeholder="e.g. October salary"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
          </div>

          {submitError ? (
            <div style={{ ...textStyle("callout"), color: colors.danger }} role="alert">
              {submitError}
            </div>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}
