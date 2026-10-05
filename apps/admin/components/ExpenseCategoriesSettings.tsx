"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, IconButton, Input, Modal, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  addExpenseCategory,
  CATCH_ALL_CATEGORY,
  categoryUsage,
  deleteExpenseCategory,
  listExpenseCategories,
  renameExpenseCategory,
} from "../lib/expenses";
import { formatPrice } from "../lib/stock-display";
import PageHeader from "./PageHeader";

/** The headings expenses are filed under: add, rename (expenses follow), and remove the unused ones. */
export default function ExpenseCategoriesSettings() {
  const { colors, spacing } = useTheme();
  const [names, setNames] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reload() {
    setNames([...listExpenseCategories()]);
  }

  useEffect(reload, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function create() {
    const message = addExpenseCategory(newName);
    if (message) {
      setAddError(message);
      return;
    }
    setNotice(`${newName.trim()} added.`);
    setNewName("");
    setAddError(null);
    reload();
  }

  function saveRename() {
    if (!renaming) return;
    const message = renameExpenseCategory(renaming.from, renaming.to);
    if (message) {
      setRenameError(message);
      return;
    }
    setNotice(`Renamed to ${renaming.to.trim()}. Expenses filed under it follow the new name.`);
    setRenaming(null);
    setRenameError(null);
    reload();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Expense categories"
        subtitle="The headings expenses are filed under."
        backHref="/settings"
        backLabel="Back to settings"
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <div style={{ display: "flex", alignItems: "flex-start", gap: spacing[3], maxWidth: 520 }}>
        <div style={{ flex: 1 }}>
          <Input
            autoComplete="off"
            placeholder="New category, e.g. Insurance"
            aria-label="New expense category"
            aria-invalid={addError ? true : undefined}
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setAddError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") create();
            }}
          />
          {addError ? (
            <div
              role="alert"
              style={{ ...textStyle("footnote"), color: colors.danger, marginTop: spacing[2] }}
            >
              {addError}
            </div>
          ) : null}
        </div>
        <Button type="button" variant="primary" onClick={create}>
          Add category
        </Button>
      </div>

      <Card style={{ padding: `${spacing[2]}px ${spacing[6]}px` }}>
        {names.map((name, index) => {
          const usage = categoryUsage(name);
          const locked = name === CATCH_ALL_CATEGORY;
          const isRenaming = renaming?.from === name;
          return (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing[4],
                minHeight: 68,
                borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
              }}
            >
              {isRenaming ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: spacing[2],
                    flex: 1,
                    maxWidth: 440,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
                    <Input
                      autoFocus
                      autoComplete="off"
                      aria-label="Category name"
                      value={renaming.to}
                      aria-invalid={renameError ? true : undefined}
                      onChange={(event) => {
                        setRenaming({ from: name, to: event.target.value });
                        setRenameError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveRename();
                        if (event.key === "Escape") setRenaming(null);
                      }}
                    />
                    <Button type="button" variant="primary" onClick={saveRename}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setRenaming(null);
                        setRenameError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {renameError ? (
                    <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                      {renameError}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{name}</div>
                    <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      {usage.items === 0
                        ? "Not used yet"
                        : `${usage.items} ${usage.items === 1 ? "item" : "items"} on ${usage.bills} ${usage.bills === 1 ? "bill" : "bills"} · ${formatPrice(usage.spent)} spent`}
                      {locked ? " · catch-all, always kept" : ""}
                    </div>
                  </div>
                  {!locked ? (
                    <div style={{ display: "flex", gap: spacing[1] }}>
                      <IconButton
                        icon="edit"
                        label={`Rename ${name}`}
                        onClick={() => {
                          setRenaming({ from: name, to: name });
                          setRenameError(null);
                        }}
                      />
                      <IconButton
                        icon="close"
                        label={
                          usage.items > 0
                            ? `${name} is in use and can't be deleted`
                            : `Delete ${name}`
                        }
                        onClick={() =>
                          usage.items > 0
                            ? setNotice(
                                `${name} is used on ${usage.bills} bills, so it can't be deleted. Rename it instead.`,
                              )
                            : setDeleting(name)
                        }
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </Card>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Delete {deleting}?</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            No expenses are filed under it, so nothing else changes.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (deleting) deleteExpenseCategory(deleting);
                setDeleting(null);
                reload();
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
