"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Checkbox, Input, Modal, textStyle } from "@zenzoo/ui-web";
import { useEffect, useMemo, useState } from "react";
import {
  getAutoImport,
  importInventoryItems,
  listUnimportedInventoryItems,
  setAutoImport,
  type InventoryItem,
} from "../lib/catalogue-items";
import { formatPrice } from "../lib/stock-display";

export interface ImportFromInventoryModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import with how many items were added. */
  onImported: (count: number) => void;
}

/** Picks inventory products that aren't in the catalogue yet and adds them. */
export default function ImportFromInventoryModal({
  open,
  onClose,
  onImported,
}: ImportFromInventoryModalProps) {
  const { colors, radius, spacing } = useTheme();
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keepImporting, setKeepImporting] = useState(false);
  // What the store's setting was when the popup opened - to tell a real change from a re-save.
  const [wasAutoImport, setWasAutoImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(new Set());
    setItems(null);
    setError(null);
    Promise.all([listUnimportedInventoryItems(), getAutoImport()])
      .then(([list, autoImport]) => {
        setItems(list);
        setKeepImporting(autoImport);
        setWasAutoImport(autoImport);
      })
      .catch((reason: unknown) => {
        setItems([]);
        setError(reason instanceof Error ? reason.message : "Couldn't load inventory.");
      });
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (item) =>
        !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q),
    );
  }, [items, query]);

  // With auto-import on, everything comes in - the list just shows what that will be, locked.
  const picked = keepImporting ? new Set((items ?? []).map((item) => item.id)) : selected;

  // "Select all" works on what the search is showing, so you can search then tick everything.
  const pickedInView = filtered.filter((item) => picked.has(item.id)).length;
  const allState: boolean | "mixed" =
    filtered.length > 0 && pickedInView === filtered.length
      ? true
      : pickedInView > 0
        ? "mixed"
        : false;

  function toggle(id: string, on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const item of filtered) {
        if (on) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    setError(null);
    let added = 0;
    // Switching auto-import on imports everything server-side in one go; it was
    // already on, "import all" just sweeps up whatever is listed here.
    if (keepImporting !== wasAutoImport) {
      const result = await setAutoImport(keepImporting);
      if (typeof result === "string") return fail(result);
      added += result;
    }
    if (!(keepImporting && !wasAutoImport) && picked.size > 0) {
      const result = await importInventoryItems([...picked]);
      if (typeof result === "string") return fail(result);
      added += result;
    }
    setSaving(false);
    onImported(added);
    onClose();
  }

  function fail(message: string) {
    setSaving(false);
    setError(message);
  }

  // Saving only the auto-import switch is allowed even with nothing ticked.
  const settingChanged = keepImporting !== wasAutoImport;
  const canSubmit = !saving && items !== null && (picked.size > 0 || settingChanged);
  const submitLabel =
    picked.size === 0
      ? "Save"
      : keepImporting
        ? `Import all ${picked.size} ${picked.size === 1 ? "item" : "items"}`
        : `Import ${picked.size} ${picked.size === 1 ? "item" : "items"}`;

  return (
    <Modal open={open} onClose={onClose}>
      <div
        style={{
          width: 560,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: spacing[5],
        }}
      >
        <div>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Import from inventory</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[2]}px 0 0` }}
          >
            Pick the stock items to list in the catalogue. They keep their selling price.
          </p>
        </div>

        <Input
          type="search"
          placeholder="Search name, category..."
          aria-label="Search inventory items"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div
          style={{
            padding: spacing[4],
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceSunken,
          }}
        >
          <Checkbox
            checked={keepImporting}
            onChange={setKeepImporting}
            label={
              <span style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
                <span>Keep importing all new inventory items</span>
                <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                  Anything added to inventory later shows up in the catalogue on its own.
                </span>
              </span>
            }
          />
        </div>

        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `${spacing[3]}px ${spacing[4]}px`,
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <Checkbox
              checked={allState}
              onChange={toggleAll}
              disabled={keepImporting || filtered.length === 0}
              label="Select all"
            />
            <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
              {keepImporting
                ? "All items will be imported"
                : selected.size > 0
                  ? `${selected.size} selected`
                  : `${items?.length ?? 0} not in the catalogue`}
            </span>
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {items === null ? (
              <Empty>Loading inventory...</Empty>
            ) : items.length === 0 ? (
              <Empty>Everything in inventory is already in the catalogue.</Empty>
            ) : filtered.length === 0 ? (
              <Empty>No items match.</Empty>
            ) : (
              filtered.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing[3],
                    padding: `${spacing[3]}px ${spacing[4]}px`,
                    borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
                  }}
                >
                  <Checkbox
                    checked={picked.has(item.id)}
                    disabled={keepImporting}
                    onChange={(on) => toggle(item.id, on)}
                    label={
                      <span style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ ...textStyle("body"), color: colors.ink }}>{item.name}</span>
                        <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                          {item.category}
                        </span>
                      </span>
                    }
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <span style={{ ...textStyle("data"), color: colors.ink }}>
                    {item.price === null
                      ? "No price"
                      : item.variantCount > 1
                        ? `from ${formatPrice(item.price)}`
                        : formatPrice(item.price)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {error ? (
          <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[3] }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {saving ? "Importing..." : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Empty({ children }: { children: string }) {
  const { colors, spacing } = useTheme();
  return (
    <div style={{ ...textStyle("callout"), color: colors.inkMuted, padding: spacing[6] }}>
      {children}
    </div>
  );
}
