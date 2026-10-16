"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, IconButton, Input, Modal, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  addExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
  renameExpenseCategory,
  type ExpenseCategory,
} from "../expenses/expenseCategories";
import { formatPrice } from "../../lib/stock-display";
import PageHeader from "../../components/PageHeader";

/** The headings expenses are filed under: add, rename (expenses follow), and remove the unused ones. */
export default function ExpenseCategoriesSettings() {
  const { colors, spacing } = useTheme();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ from: ExpenseCategory; to: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ExpenseCategory | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    setCategories(await listExpenseCategories());
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function create() {
    const result = await addExpenseCategory(newName);
    if (typeof result === "string") {
      setAddError(result);
      return;
    }
    setNotice(`${newName.trim()} added.`);
    setNewName("");
    setAddError(null);
    void reload();
  }

  async function saveRename() {
    if (!renaming) return;
    const message = await renameExpenseCategory(renaming.from, renaming.to);
    if (message) {
      setRenameError(message);
      return;
    }
    setNotice(`Renamed to ${renaming.to.trim()}. Expenses filed under it follow the new name.`);
    setRenaming(null);
    setRenameError(null);
    void reload();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const message = await deleteExpenseCategory(deleting);
    setDeleting(null);
    if (message) setNotice(message);
    void reload();
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
              if (event.key === "Enter") void create();
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
        <Button type="button" variant="primary" onClick={() => void create()}>
          Add category
        </Button>
      </div>

      <Card style={{ padding: `${spacing[2]}px ${spacing[6]}px` }}>
        {categories.map((category, index) => {
          const { name } = category;
          const usage = category;
          const locked = category.isCatchAll;
          const isRenaming = renaming?.from.id === category.id;
          return (
            <div
              key={category.id}
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
                        setRenaming({ from: category, to: event.target.value });
                        setRenameError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveRename();
                        if (event.key === "Escape") setRenaming(null);
                      }}
                    />
                    <Button type="button" variant="primary" onClick={() => void saveRename()}>
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
                        : `${usage.items} ${usage.items === 1 ? "item" : "items"} on ${usage.bills} ${usage.bills === 1 ? "bill" : "bills"} · ${formatPrice(usage.spent)} billed`}
                      {locked ? " · catch-all, always kept" : ""}
                    </div>
                  </div>
                  {!locked ? (
                    <div style={{ display: "flex", gap: spacing[1] }}>
                      <IconButton
                        icon="edit"
                        label={`Rename ${name}`}
                        onClick={() => {
                          setRenaming({ from: category, to: name });
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
                            : setDeleting(category)
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
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Delete {deleting?.name}?</div>
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
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
