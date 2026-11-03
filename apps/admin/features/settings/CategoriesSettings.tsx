"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, IconButton, Input, Modal, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { useAccess } from "../../lib/access";
import { NAME_MAX, cleanName } from "../../lib/text";
import { useSingleFlight } from "../../lib/useSingleFlight";
import {
  addCategory,
  addSubcategory,
  deleteCategory,
  listCategories,
  productsInCategory,
  productsInSubcategory,
  renameCategory,
  renameCategoryInProducts,
  renameSubcategoryInProducts,
  type Category,
  type Subcategory,
} from "../../lib/catalogue";
import { listProducts, saveProducts, type Product } from "../stocks/stocks";
import PageHeader from "../../components/PageHeader";
import StoreSwitcher from "../../components/StoreSwitcher";

/** Categories and their subcategories: add, rename, remove, and see how many products use each. */
export default function CategoriesSettings() {
  const { colors, radius, spacing } = useTheme();
  // Categories belong to Stocks on the server, so changing them takes Stocks access.
  const { can } = useAccess();
  const canEdit = can("settings", "edit");
  const canDelete = can("settings", "delete");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [addingSubTo, setAddingSubTo] = useState<{ id: string; name: string } | null>(null);
  const [renamingSub, setRenamingSub] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{
    id: string;
    name: string;
    kind: "category" | "subcategory";
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const categorySave = useSingleFlight();
  const subSave = useSingleFlight();
  const subRenameSave = useSingleFlight();
  const deleteSave = useSingleFlight();

  async function reload() {
    const list = [...(await listCategories())];
    setCategories(list);
    setProducts([...(await listProducts())]);
    return list;
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function create() {
    return categorySave.run(async () => {
      if (newName.trim() === "") {
        setError("Enter a name.");
        return;
      }
      const category = await addCategory(newName);
      if (typeof category === "string") {
        setError(category);
        return;
      }
      closeCreate();
      setAddingSubTo({ id: category.id, name: "" });
      void reload();
    });
  }

  function openCreate() {
    setNewName("");
    setError(null);
    setCreating(true);
  }

  function closeCreate() {
    setCreating(false);
    setNewName("");
    setError(null);
  }

  const needle = query.trim().toLowerCase();
  const visibleCategories = needle
    ? categories.filter(
        (category) =>
          category.name.toLowerCase().includes(needle) ||
          category.subcategories.some((sub) => sub.name.toLowerCase().includes(needle)),
      )
    : categories;

  /**
   * Shows why an edit failed. The list is refreshed too, because a failure is often a stale
   * screen (another tab deleted it); if the category is gone, its card goes with it, so the
   * message moves to the top where it can still be read.
   */
  async function showFailure(
    message: string,
    stillThere: (list: Category[]) => boolean,
    closeEditor: () => void,
  ) {
    setError(message);
    const list = await reload();
    if (!stillThere(list)) {
      closeEditor();
      setError(null);
      setNotice(message);
    }
  }

  async function saveRename(category: Category) {
    if (!renaming) return;
    if (renaming.name.trim() === "") {
      setError("Enter a name.");
      return;
    }
    const problem = await renameCategory(category.id, renaming.name);
    if (problem) {
      await showFailure(
        problem,
        (list) => list.some((item) => item.id === category.id),
        () => setRenaming(null),
      );
      return;
    }
    // Products carry the category by name, so they follow the rename - with the spacing the
    // server saved, or they would no longer match.
    const renamed = cleanName(renaming.name);
    saveProducts(renameCategoryInProducts(await listProducts(), category.name, renamed));
    setRenaming(null);
    setError(null);
    setNotice(`Renamed to ${renamed}.`);
    void reload();
  }

  function saveSub(category: Category) {
    return subSave.run(async () => {
      if (!addingSubTo) return;
      if (addingSubTo.name.trim() === "") {
        setError("Enter a name.");
        return;
      }
      const problem = await addSubcategory(category.id, addingSubTo.name);
      if (problem) {
        await showFailure(
          problem,
          (list) => list.some((item) => item.id === category.id),
          () => setAddingSubTo(null),
        );
        return;
      }
      setAddingSubTo(null);
      setError(null);
      void reload();
    });
  }

  function saveSubRename(category: Category, sub: Subcategory) {
    return subRenameSave.run(async () => {
      if (!renamingSub) return;
      if (renamingSub.name.trim() === "") {
        setError("Enter a name.");
        return;
      }
      const problem = await renameCategory(sub.id, renamingSub.name);
      if (problem) {
        await showFailure(
          problem,
          (list) => list.some((item) => item.subcategories.some((other) => other.id === sub.id)),
          () => setRenamingSub(null),
        );
        return;
      }
      // Products carry the subcategory by name too, so they follow the rename.
      const renamed = cleanName(renamingSub.name);
      saveProducts(
        renameSubcategoryInProducts(await listProducts(), category.name, sub.name, renamed),
      );
      setRenamingSub(null);
      setError(null);
      setNotice(`Renamed to ${renamed}.`);
      void reload();
    });
  }

  function confirmDelete() {
    return deleteSave.run(async () => {
      if (!deleting) return;
      const target = deleting;
      setDeleting(null);
      const problem = await deleteCategory(target.id);
      if (problem) setNotice(problem);
      void reload();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Categories"
        subtitle="Group your products. Subcategories sit inside a category."
        backHref="/settings"
        backLabel="Back to settings"
        action={<StoreSwitcher onChange={() => void reload()} />}
      />

      {notice ? <Notice>{notice}</Notice> : null}

      {canEdit ? (
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
              aria-label="Search categories"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button type="button" variant="primary" onClick={openCreate}>
            Add category
          </Button>
        </div>
      ) : (
        <div style={{ maxWidth: 360, width: "100%" }}>
          <Input
            type="search"
            autoComplete="off"
            placeholder="Search categories..."
            aria-label="Search categories"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}

      {needle && visibleCategories.length === 0 ? (
        <div style={{ ...textStyle("callout"), color: colors.inkMuted }}>
          No categories match "{query.trim()}".
        </div>
      ) : null}

      {visibleCategories.map((category) => {
        const used = productsInCategory(products, category.name);
        const isRenaming = renaming?.id === category.id;
        const isAdding = addingSubTo?.id === category.id;
        return (
          <Card
            key={category.id}
            style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing[4],
              }}
            >
              {isRenaming ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing[3],
                    flex: 1,
                    maxWidth: 420,
                  }}
                >
                  <Input
                    autoFocus
                    autoComplete="off"
                    aria-label="Category name"
                    maxLength={NAME_MAX}
                    value={renaming.name}
                    aria-invalid={error ? true : undefined}
                    onChange={(event) => setRenaming({ id: category.id, name: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveRename(category);
                      if (event.key === "Escape") setRenaming(null);
                    }}
                  />
                  <Button type="button" variant="primary" onClick={() => void saveRename(category)}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setRenaming(null);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      ...textStyle("headline"),
                      color: colors.ink,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {category.name}
                  </div>
                  <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    {used} {used === 1 ? "product" : "products"} · {category.subcategories.length}{" "}
                    {category.subcategories.length === 1 ? "subcategory" : "subcategories"}
                  </div>
                </div>
              )}
              {!isRenaming ? (
                <div style={{ display: "flex", gap: spacing[1] }}>
                  {canEdit ? (
                    <IconButton
                      icon="edit"
                      label={`Rename ${category.name}`}
                      onClick={() => {
                        setRenaming({ id: category.id, name: category.name });
                        setRenamingSub(null);
                        setError(null);
                      }}
                    />
                  ) : null}
                  {canDelete ? (
                    <IconButton
                      icon="trash"
                      label={
                        used > 0
                          ? `${category.name} is in use and can't be deleted`
                          : `Delete ${category.name}`
                      }
                      onClick={() =>
                        used > 0
                          ? setNotice(
                              `${category.name} has ${used} products. Move them to another category first.`,
                            )
                          : setDeleting({ id: category.id, name: category.name, kind: "category" })
                      }
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
            {isRenaming && error ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {error}
              </div>
            ) : null}

            {category.subcategories.length > 0 || isAdding || canEdit ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {category.subcategories.map((sub) => {
                  const count = productsInSubcategory(products, category.name, sub.name);
                  const isRenamingSub = renamingSub?.id === sub.id;
                  return (
                    <div
                      key={sub.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: spacing[4],
                        minHeight: 56,
                        paddingLeft: spacing[4],
                        borderTop: `1px solid ${colors.border}`,
                      }}
                    >
                      {isRenamingSub ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: spacing[2],
                            flex: 1,
                            maxWidth: 440,
                            paddingBlock: spacing[3],
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: spacing[3] }}>
                            <Input
                              autoFocus
                              autoComplete="off"
                              aria-label="Subcategory name"
                              maxLength={NAME_MAX}
                              value={renamingSub.name}
                              aria-invalid={error ? true : undefined}
                              onChange={(event) => {
                                setRenamingSub({ id: sub.id, name: event.target.value });
                                setError(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void saveSubRename(category, sub);
                                if (event.key === "Escape") {
                                  setRenamingSub(null);
                                  setError(null);
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="primary"
                              loading={subRenameSave.busy}
                              onClick={() => void saveSubRename(category, sub)}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setRenamingSub(null);
                                setError(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                          {error ? (
                            <div
                              role="alert"
                              style={{ ...textStyle("footnote"), color: colors.danger }}
                            >
                              {error}
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
                              {sub.name}
                            </div>
                            <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                              {count} {count === 1 ? "product" : "products"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: spacing[1] }}>
                            {canEdit ? (
                              <IconButton
                                icon="edit"
                                label={`Rename ${sub.name}`}
                                onClick={() => {
                                  setRenamingSub({ id: sub.id, name: sub.name });
                                  setRenaming(null);
                                  setAddingSubTo(null);
                                  setError(null);
                                }}
                              />
                            ) : null}
                            {canDelete ? (
                              <IconButton
                                icon="trash"
                                label={
                                  count > 0
                                    ? `${sub.name} is in use and can't be deleted`
                                    : `Delete ${sub.name}`
                                }
                                onClick={() =>
                                  count > 0
                                    ? setNotice(
                                        `${sub.name} has ${count} ${count === 1 ? "product" : "products"}. Move ${count === 1 ? "it" : "them"} to another subcategory first.`,
                                      )
                                    : setDeleting({
                                        id: sub.id,
                                        name: sub.name,
                                        kind: "subcategory",
                                      })
                                }
                              />
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {isAdding ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: spacing[2],
                      paddingBlock: spacing[3],
                      paddingLeft: spacing[4],
                      borderTop: `1px solid ${colors.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: spacing[3],
                        maxWidth: 440,
                      }}
                    >
                      <Input
                        autoFocus
                        autoComplete="off"
                        placeholder="Subcategory name"
                        aria-label="New subcategory name"
                        maxLength={NAME_MAX}
                        value={addingSubTo.name}
                        aria-invalid={error ? true : undefined}
                        onChange={(event) => {
                          setAddingSubTo({ id: category.id, name: event.target.value });
                          setError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveSub(category);
                          if (event.key === "Escape") setAddingSubTo(null);
                        }}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        loading={subSave.busy}
                        onClick={() => void saveSub(category)}
                      >
                        Add
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setAddingSubTo(null);
                          setError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    {error ? (
                      <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                        {error}
                      </div>
                    ) : null}
                  </div>
                ) : canEdit ? (
                  <div
                    style={{
                      paddingTop: spacing[3],
                      paddingLeft: spacing[4],
                      borderTop:
                        category.subcategories.length > 0 ? `1px solid ${colors.border}` : "none",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAddingSubTo({ id: category.id, name: "" });
                        setRenamingSub(null);
                        setError(null);
                      }}
                      style={{
                        ...textStyle("callout"),
                        height: 36,
                        paddingInline: spacing[4],
                        border: `1px dashed ${colors.border}`,
                        borderRadius: radius.full,
                        background: "transparent",
                        color: colors.inkMuted,
                        cursor: "pointer",
                      }}
                    >
                      + Add subcategory
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        );
      })}

      <Modal open={creating} onClose={closeCreate}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          style={{ width: 420, maxWidth: "100%" }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>New category</div>
          <div style={{ marginTop: spacing[4] }}>
            <Input
              autoFocus
              autoComplete="off"
              placeholder="e.g. Kids wear"
              maxLength={NAME_MAX}
              aria-label="Category name"
              aria-invalid={error ? true : undefined}
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                setError(null);
              }}
            />
            {error ? (
              <div
                role="alert"
                style={{ ...textStyle("footnote"), color: colors.danger, marginTop: spacing[2] }}
              >
                {error}
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
            <Button type="submit" variant="primary" loading={categorySave.busy}>
              Save category
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink, overflowWrap: "anywhere" }}>
            Delete {deleting?.name}?
          </div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            {deleting?.kind === "subcategory"
              ? "No products use this subcategory, so nothing else changes."
              : "No products use this category, so nothing else changes. Its subcategories are removed with it."}
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
    </div>
  );
}
