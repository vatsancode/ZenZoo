"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, IconButton, Input, Modal, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { useAccess } from "../../lib/access";
import { NAME_MAX, cleanName } from "../../lib/text";
import { useSingleFlight } from "../../lib/useSingleFlight";
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
  const { can } = useAccess();
  const canEdit = can("expenses", "edit");
  const canDelete = can("expenses", "delete");
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ from: ExpenseCategory; to: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ExpenseCategory | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const addSave = useSingleFlight();
  const renameSave = useSingleFlight();
  const deleteSave = useSingleFlight();

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

  function openCreate() {
    setNewName("");
    setAddError(null);
    setCreating(true);
  }

  function closeCreate() {
    setCreating(false);
    setNewName("");
    setAddError(null);
  }

  function create() {
    return addSave.run(async () => {
      const result = await addExpenseCategory(newName);
      if (typeof result === "string") {
        setAddError(result);
        return;
      }
      setNotice(`${cleanName(newName)} added.`);
      closeCreate();
      void reload();
    });
  }

  function saveRename() {
    return renameSave.run(async () => {
      if (!renaming) return;
      const message = await renameExpenseCategory(renaming.from, renaming.to);
      if (message) {
        setRenameError(message);
        return;
      }
      setNotice(
        `Renamed to ${cleanName(renaming.to)}. Expenses filed under it follow the new name.`,
      );
      setRenaming(null);
      setRenameError(null);
      void reload();
    });
  }

  function confirmDelete() {
    return deleteSave.run(async () => {
      if (!deleting) return;
      const message = await deleteExpenseCategory(deleting);
      setDeleting(null);
      if (message) setNotice(message);
      void reload();
    });
  }

  const needle = query.trim().toLowerCase();
  const visibleCategories = needle
    ? categories.filter((category) => category.name.toLowerCase().includes(needle))
    : categories;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Expense categories"
        subtitle="The headings expenses are filed under."
        backHref="/settings"
        backLabel="Back to settings"
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing[3],
        }}
      >
        <div style={{ maxWidth: 360, width: "100%" }}>
          <Input
            type="search"
            autoComplete="off"
            placeholder="Search categories..."
            aria-label="Search expense categories"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {canEdit ? (
          <Button type="button" variant="primary" onClick={openCreate}>
            Add category
          </Button>
        ) : null}
      </div>

      {needle && visibleCategories.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          No categories match "{query.trim()}".
        </div>
      ) : null}

      <Card style={{ padding: `${spacing[2]}px ${spacing[6]}px` }}>
        {visibleCategories.map((category, index) => {
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
                      maxLength={NAME_MAX}
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
                    <Button
                      type="button"
                      variant="primary"
                      loading={renameSave.busy}
                      onClick={() => void saveRename()}
                    >
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
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        ...textStyle("bodyMedium"),
                        color: colors.ink,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {name}
                    </div>
                    <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      {usage.items === 0
                        ? "Not used yet"
                        : `${usage.items} ${usage.items === 1 ? "item" : "items"} on ${usage.bills} ${usage.bills === 1 ? "bill" : "bills"} · ${formatPrice(usage.spent)} billed`}
                      {locked ? " · catch-all, always kept" : ""}
                    </div>
                  </div>
                  {!locked && canEdit ? (
                    <div style={{ display: "flex", gap: spacing[1] }}>
                      <IconButton
                        icon="edit"
                        label={`Rename ${name}`}
                        onClick={() => {
                          setRenaming({ from: category, to: name });
                          setRenameError(null);
                        }}
                      />
                      {canDelete ? (
                        <IconButton
                          icon="trash"
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
                      ) : null}
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
          <div style={{ ...textStyle("title3"), color: colors.ink, overflowWrap: "anywhere" }}>
            Delete {deleting?.name}?
          </div>
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
              loading={deleteSave.busy}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={creating} onClose={closeCreate}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          style={{ width: 420, maxWidth: "100%" }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>New expense category</div>
          <div style={{ marginTop: spacing[4] }}>
            <Input
              autoFocus
              autoComplete="off"
              placeholder="e.g. Insurance"
              maxLength={NAME_MAX}
              aria-label="Category name"
              aria-invalid={addError ? true : undefined}
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                setAddError(null);
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
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={addSave.busy}>
              Save category
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
