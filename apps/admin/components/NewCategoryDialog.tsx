"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Input, Modal, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { useSingleFlight } from "../lib/useSingleFlight";
import FormField from "./FormField";

interface NewCategoryDialogProps {
  open: boolean;
  /** "New category" or "New subcategory". */
  title: string;
  /** What was typed in the dropdown's search box, if anything. */
  initialName: string;
  /** Saves the name. Resolves to the reason it failed, or null once saved (the caller then closes). */
  onSave: (name: string) => Promise<string | null>;
  onClose: () => void;
}

// categories.name is capped by the API at 100 characters.
const MAX_NAME_LENGTH = 100;

/**
 * A small dialog that names and saves one new category or subcategory. It is a dialog (not a
 * box inside the dropdown) so Save and Cancel are always in plain sight.
 */
export default function NewCategoryDialog({
  open,
  title,
  initialName,
  onSave,
  onClose,
}: NewCategoryDialogProps) {
  const { colors, spacing } = useTheme();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { busy: saving, run: runSave } = useSingleFlight();

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
    // Only when it opens - not when the typed text changes behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function save() {
    return runSave(async () => {
      if (name.trim() === "") {
        setError("Give it a name.");
        return;
      }
      setError(await onSave(name.trim()));
    });
  }

  return (
    <Modal open={open} onClose={saving ? () => undefined : onClose}>
      <div
        style={{ display: "flex", flexDirection: "column", gap: spacing[6], width: 360 }}
        // The dialog sits inside a Sheet, which closes on Escape - this one closes first.
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (!saving) onClose();
        }}
      >
        <div style={{ ...textStyle("title2"), color: colors.ink }}>{title}</div>
        <FormField id="new-category-name" label="NAME" span={12} error={error}>
          <Input
            id="new-category-name"
            autoFocus
            autoComplete="off"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            readOnly={saving}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            // Not a <form>: this renders inside the item's form, and a nested submit would reach it.
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void save();
            }}
          />
        </FormField>
        <div style={{ display: "flex", gap: spacing[3] }}>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void save()}
            disabled={saving}
            style={{ flex: 1 }}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
