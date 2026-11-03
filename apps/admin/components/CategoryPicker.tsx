"use client";

import { Select } from "@zenzoo/ui-web";
import { useMemo, useState, type KeyboardEvent } from "react";
import { createCategoryRow, type CategoryResponse } from "../lib/catalogue";
import FormField from "./FormField";
import NewCategoryDialog from "./NewCategoryDialog";

interface CategoryPickerProps {
  /** Every category and subcategory of this store, flat - the caller keeps this list. */
  categories: CategoryResponse[];
  categoryId: string;
  subcategoryId: string;
  onChange: (next: { categoryId: string; subcategoryId: string }) => void;
  /**
   * A category or subcategory was just created. The caller must add it to `categories`
   * so it can be shown as the selection.
   */
  onCreated: (row: CategoryResponse) => void;
  /**
   * Offers "Add new category" / "Add new subcategory". Creating one is a Settings write
   * (the API refuses anyone without it), so pass the Settings edit check, not the page's own.
   */
  canCreate: boolean;
  /** Ids are `${idPrefix}-category` and `${idPrefix}-subcategory`. */
  idPrefix: string;
  /** Columns each field takes on the form's 12-column grid. */
  span: number;
  /** Shown under the Category field. */
  error?: string | null;
  disabled?: boolean;
  /** Per-field key handler, e.g. Enter moving to the next field. Gets the field's id. */
  onFieldKeyDown?: (id: string) => (event: KeyboardEvent<HTMLElement>) => void;
}

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/**
 * The Category + Subcategory pair every product and catalogue form uses. "Add new..." opens a
 * dialog that saves the new category or subcategory and then selects it, so saving the item
 * itself never has to create anything.
 */
export default function CategoryPicker({
  categories,
  categoryId,
  subcategoryId,
  onChange,
  onCreated,
  canCreate,
  idPrefix,
  span,
  error = null,
  disabled,
  onFieldKeyDown,
}: CategoryPickerProps) {
  // Shown inside the open lists, not under the field, for someone who can't add one.
  const askForNew = canCreate
    ? undefined
    : "Need a new category or subcategory? Ask someone with Settings access to add it.";
  const categoryFieldId = `${idPrefix}-category`;
  const subcategoryFieldId = `${idPrefix}-subcategory`;

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((row) => row.parentId === null)
        .map((row) => ({ value: row.id, label: row.name }))
        .sort(byLabel),
    [categories],
  );
  const subcategoryOptions = useMemo(
    () =>
      categories
        .filter((row) => row.parentId !== null && row.parentId === categoryId)
        .map((row) => ({ value: row.id, label: row.name }))
        .sort(byLabel),
    [categories, categoryId],
  );

  // The dialog's target: a top-level category, or a subcategory under `parentId`.
  const [adding, setAdding] = useState<{ typed: string; parentId?: string } | null>(null);

  function closeDialog() {
    const fieldId = adding?.parentId ? subcategoryFieldId : categoryFieldId;
    setAdding(null);
    setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
  }

  async function saveNew(name: string): Promise<string | null> {
    if (!adding) return null;
    const created = await createCategoryRow(name, adding.parentId);
    if (typeof created === "string") return created;
    onCreated(created);
    onChange(
      adding.parentId
        ? { categoryId: adding.parentId, subcategoryId: created.id }
        : { categoryId: created.id, subcategoryId: "" },
    );
    closeDialog();
    return null;
  }

  return (
    <>
      <FormField id={categoryFieldId} label="CATEGORY" span={span} error={error}>
        <Select
          id={categoryFieldId}
          options={categoryOptions}
          value={categoryId}
          placeholder="Select a category"
          creatable={canCreate}
          createLabel="Add new category"
          hint={askForNew}
          onCreateRequest={(typed) => setAdding({ typed })}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(next) => onChange({ categoryId: next, subcategoryId: "" })}
          onKeyDown={onFieldKeyDown?.(categoryFieldId)}
        />
      </FormField>
      <FormField id={subcategoryFieldId} label="SUBCATEGORY (OPTIONAL)" span={span}>
        <Select
          id={subcategoryFieldId}
          options={[{ value: "", label: "None" }, ...subcategoryOptions]}
          value={subcategoryId}
          placeholder={categoryId ? "Select a subcategory" : "Choose a category first"}
          creatable={canCreate}
          createLabel="Add new subcategory"
          hint={askForNew}
          onCreateRequest={(typed) => setAdding({ typed, parentId: categoryId })}
          disabled={disabled || categoryId === ""}
          onChange={(next) => onChange({ categoryId, subcategoryId: next })}
          onKeyDown={onFieldKeyDown?.(subcategoryFieldId)}
        />
      </FormField>
      <NewCategoryDialog
        open={adding !== null}
        title={adding?.parentId ? "New subcategory" : "New category"}
        initialName={adding?.typed ?? ""}
        onSave={saveNew}
        onClose={closeDialog}
      />
    </>
  );
}
