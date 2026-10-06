"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, DatePicker, Sheet, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import type { Purchase, PurchaseItem } from "./purchases";
import { today } from "../../lib/date-ranges";
import FormField from "../../components/FormField";
import InfoTip from "../../components/InfoTip";
import QuantityPill from "../../components/QuantityPill";

export interface DeliveryInput {
  date: string;
  /** Only the lines that have something arriving. */
  arrived: { item: PurchaseItem; quantity: number }[];
}

interface ReceiveSheetProps {
  open: boolean;
  purchase: Purchase;
  onClose: () => void;
  onConfirm: (delivery: DeliveryInput) => void;
}

const number = (value: string) => (value.trim() === "" ? 0 : Number(value));
const pendingOf = (item: PurchaseItem) => Math.max(item.quantity - (item.received ?? 0), 0);

/**
 * Records one delivery against a purchase. Each product is one row: how much has
 * arrived so far, and a counter for how many arrived this time.
 */
export default function ReceiveSheet({ open, purchase, onClose, onConfirm }: ReceiveSheetProps) {
  const { colors, spacing } = useTheme();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) return;
    setQuantities({});
    setDate(today());
    setTouched(false);
  }, [open]);

  const items = purchase.items ?? [];
  const waiting = items.filter((item) => pendingOf(item) > 0);
  const completed = items.length - waiting.length;

  const arrived = waiting
    .map((item) => ({ item, quantity: number(quantities[item.sku] ?? "") }))
    .filter((entry) => entry.quantity > 0);
  const units = arrived.reduce((sum, entry) => sum + entry.quantity, 0);

  function problemWith(item: PurchaseItem): string | null {
    const typed = quantities[item.sku] ?? "";
    const quantity = number(typed);
    if (typed.trim() === "") return null;
    if (Number.isNaN(quantity) || quantity < 0) return "Enter a number.";
    if (item.unit === "pcs" && !Number.isInteger(quantity)) return "Pieces must be a whole number.";
    if (quantity > pendingOf(item)) return `Only ${pendingOf(item)} ${item.unit} still to come.`;
    return null;
  }

  const anyProblem = waiting.some((item) => problemWith(item) !== null);
  const dateError = date === "" ? "Choose the delivery date." : null;

  function submit() {
    setTouched(true);
    if (arrived.length === 0 || anyProblem || dateError) return;
    onConfirm({ date, arrived });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Receive stock"
      width={560}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
          <div style={{ ...textStyle("body"), color: colors.inkMuted }}>
            {arrived.length === 0 ? (
              "Enter how many arrived to continue."
            ) : (
              <>
                <span style={{ ...textStyle("bodyMedium"), color: colors.ink }}>
                  {units} {units === 1 ? "unit" : "units"}
                </span>
                {` across ${arrived.length} ${arrived.length === 1 ? "product" : "products"} will be added to your stock.`}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: spacing[3] }}>
            <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={arrived.length === 0}
              onClick={submit}
              style={{ flex: 2 }}
            >
              Confirm delivery
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
        <FormField
          id="delivery-date"
          label="DELIVERY DATE"
          span={12}
          error={touched ? dateError : null}
        >
          <DatePicker id="delivery-date" value={date} clearable={false} onChange={setDate} />
        </FormField>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              paddingBottom: spacing[3],
            }}
          >
            <span
              style={{
                ...textStyle("body"),
                color: colors.inkMuted,
                display: "inline-flex",
                alignItems: "center",
                gap: spacing[2],
              }}
            >
              How many arrived?
              <InfoTip label="How receiving works">
                Enter what arrived in <strong>this delivery</strong>. It is added to what you have
                already received, and your stock goes up to match.
              </InfoTip>
            </span>
            <button
              type="button"
              onClick={() =>
                setQuantities(
                  Object.fromEntries(waiting.map((item) => [item.sku, String(pendingOf(item))])),
                )
              }
              style={{
                ...textStyle("bodyMedium"),
                border: "none",
                background: "transparent",
                color: colors.accent,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Everything arrived
            </button>
          </div>

          {waiting.map((item, index) => {
            const received = item.received ?? 0;
            const pending = pendingOf(item);
            const quantity = number(quantities[item.sku] ?? "");
            const problem = problemWith(item);
            const chosen = quantity > 0 && !problem;
            const after = received + (chosen ? quantity : 0);
            return (
              <div
                key={item.sku}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing[4],
                  minHeight: 76,
                  padding: `${spacing[3]}px 0`,
                  borderTop: index === 0 ? `1px solid ${colors.border}` : "none",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{item.name}</div>
                  <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
                    {item.sku}
                  </div>
                  <div
                    role={problem ? "alert" : undefined}
                    style={{
                      ...textStyle("footnote"),
                      marginTop: 2,
                      color: problem
                        ? colors.danger
                        : chosen && after >= item.quantity
                          ? colors.success
                          : colors.inkMuted,
                    }}
                  >
                    {problem
                      ? problem
                      : chosen
                        ? after >= item.quantity
                          ? `Completes this product · ${item.quantity} of ${item.quantity} received`
                          : `After this: ${after} of ${item.quantity} received`
                        : `${received} of ${item.quantity} received · ${pending} still to come`}
                  </div>
                </div>
                <QuantityPill
                  value={quantities[item.sku] ?? ""}
                  onChange={(next) =>
                    setQuantities((current) => ({ ...current, [item.sku]: next }))
                  }
                  max={pending}
                  actionLabel="Receive"
                  name={item.name}
                  invalid={Boolean(problem)}
                />
              </div>
            );
          })}
        </div>

        {completed > 0 ? (
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            {completed} {completed === 1 ? "product has" : "products have"} already arrived in full
            and {completed === 1 ? "isn't" : "aren't"} listed here.
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
