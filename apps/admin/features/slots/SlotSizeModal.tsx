"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Modal, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import FormField from "../../components/FormField";
import { getSlotMinutes, MIN_SLOT_MINUTES } from "./businessHours";

interface SlotSizeModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (minutes: number) => void;
}

/** How long one slot is, in minutes. */
export default function SlotSizeModal({ open, onClose, onSave }: SlotSizeModalProps) {
  const { colors, spacing } = useTheme();
  const [text, setText] = useState(String(getSlotMinutes()));

  // Each time it opens, start from what is saved.
  useEffect(() => {
    if (open) setText(String(getSlotMinutes()));
  }, [open]);

  const value = Number(text);
  const valid = Number.isInteger(value) && value >= MIN_SLOT_MINUTES;

  return (
    <Modal open={open} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSave(value);
        }}
        style={{
          width: 400,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: spacing[5],
        }}
      >
        <div>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Slot size</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            Bookings start on every slot.
          </div>
        </div>

        <FormField
          id="slot-size"
          label="MINUTES"
          span={12}
          error={valid || text === "" ? null : "Enter a whole number of minutes, 1 or more."}
        >
          <Input
            id="slot-size"
            type="number"
            inputMode="numeric"
            min={MIN_SLOT_MINUTES}
            step={1}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </FormField>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[2] }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            Save slot size
          </Button>
        </div>
      </form>
    </Modal>
  );
}
