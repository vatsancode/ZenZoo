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

/**
 * Records one delivery against a purchase - can be confirmed more than once
 * per purchase, each time covering only the lines/quantities that actually
 * arrived. Matches receivePurchase on the backend exactly: each line here
 * maps to one inventory_batches + stock_movements row there.
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

  const items = purchase.items;
  const waiting = items.filter((item) => item.pending > 0);
  const completed = items.length - waiting.length;

  const arrived = waiting
    .map((item) => ({ item, quantity: number(quantities[item.id] ?? "") }))
    .filter((entry) => entry.quantity > 0);
  const units = arrived.reduce((sum, entry) => sum + entry.quantity, 0);

  function problemWith(item: PurchaseItem): string | null {
    const typed = quantities[item.id] ?? "";
    const quantity = number(typed);
    if (typed.trim() === "") return null;
    if (Number.isNaN(quantity) || quantity < 0) return "Enter a number.";
    if (!Number.isInteger(quantity)) return "Must be a whole number.";
    if (quantity > item.pending) return `Only ${item.pending} still to come.`;
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
        <FormField id="delivery-date" label="DELIVERY DATE" span={12} error={touched ? dateError : null}>
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
                setQuantities(Object.fromEntries(waiting.map((item) => [item.id, String(item.pending)])))
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
            const quantity = number(quantities[item.id] ?? "");
            const problem = problemWith(item);
            const chosen = quantity > 0 && !problem;
            const after = item.received + (chosen ? quantity : 0);
            return (
              <div
                key={item.id}
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
                  {item.sku ? (
                    <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{item.sku}</div>
                  ) : null}
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
                        : `${item.received} of ${item.quantity} received · ${item.pending} still to come`}
                  </div>
                </div>
                <QuantityPill
                  value={quantities[item.id] ?? ""}
                  onChange={(next) => setQuantities((current) => ({ ...current, [item.id]: next }))}
                  max={item.pending}
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
