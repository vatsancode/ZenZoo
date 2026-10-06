"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Button, Card, Icon, IconButton, Input, Modal, Notice, textStyle } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  addCategory,
  addSubcategory,
  deleteCategory,
  listCategories,
  productsInCategory,
  productsInSubcategory,
  removeSubcategory,
  renameCategory,
  renameCategoryInProducts,
  type Category,
} from "../../lib/catalogue";
import { listProducts, saveProducts, type Product } from "../stocks/stocks";
import PageHeader from "../../components/PageHeader";

/** Categories and their subcategories: add, rename, remove, and see how many products use each. */
export default function CategoriesSettings() {
  const { colors, radius, spacing } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [addingSubTo, setAddingSubTo] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    setCategories([...(await listCategories())]);
    setProducts([...(await listProducts())]);
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
    const category = addCategory(newName);
    if (!category) {
      setError(
        newName.trim() === "" ? "Enter a name." : "A category with this name already exists.",
      );
      return;
    }
    setNewName("");
    setError(null);
    setAddingSubTo({ id: category.id, name: "" });
    void reload();
  }

  async function saveRename(category: Category) {
    if (!renaming) return;
    if (!renameCategory(category.id, renaming.name)) {
      setError(
        renaming.name.trim() === "" ? "Enter a name." : "A category with this name already exists.",
      );
      return;
    }
    // Products carry the category by name, so they follow the rename.
    saveProducts(renameCategoryInProducts(await listProducts(), category.name, renaming.name));
    setRenaming(null);
    setError(null);
    setNotice(`Renamed to ${renaming.name.trim()}.`);
    void reload();
  }

  function saveSub(category: Category) {
    if (!addingSubTo) return;
    if (addSubcategory(category.id, addingSubTo.name)) {
      setAddingSubTo(null);
      setError(null);
      void reload();
    } else {
      setError(
        addingSubTo.name.trim() === "" ? "Enter a name." : "This subcategory already exists.",
      );
    }
  }

  const pill = (children: React.ReactNode, key: string) => (
    <span
      key={key}
      style={{
        ...textStyle("callout"),
        display: "inline-flex",
        alignItems: "center",
        gap: spacing[2],
        height: 36,
        paddingInline: spacing[4],
        border: `1px solid ${colors.border}`,
        borderRadius: radius.full,
        color: colors.ink,
      }}
    >
      {children}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Categories"
        subtitle="Group your products. Subcategories sit inside a category."
        backHref="/settings"
        backLabel="Back to settings"
      />

      {notice ? <Notice>{notice}</Notice> : null}

      <div style={{ display: "flex", alignItems: "flex-start", gap: spacing[3], maxWidth: 520 }}>
        <div style={{ flex: 1 }}>
          <Input
            autoComplete="off"
            placeholder="New category, e.g. Kids wear"
            aria-label="New category name"
            aria-invalid={error && !renaming && !addingSubTo ? true : undefined}
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") create();
            }}
          />
          {error && !renaming && !addingSubTo ? (
            <div
              role="alert"
              style={{ ...textStyle("footnote"), color: colors.danger, marginTop: spacing[2] }}
            >
              {error}
            </div>
          ) : null}
        </div>
        <Button type="button" variant="primary" onClick={create}>
          Add category
        </Button>
      </div>

      {categories.map((category) => {
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
                <div>
                  <div style={{ ...textStyle("headline"), color: colors.ink }}>{category.name}</div>
                  <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                    {used} {used === 1 ? "product" : "products"} · {category.subcategories.length}{" "}
                    {category.subcategories.length === 1 ? "subcategory" : "subcategories"}
                  </div>
                </div>
              )}
              {!isRenaming ? (
                <div style={{ display: "flex", gap: spacing[1] }}>
                  <IconButton
                    icon="edit"
                    label={`Rename ${category.name}`}
                    onClick={() => {
                      setRenaming({ id: category.id, name: category.name });
                      setError(null);
                    }}
                  />
                  <IconButton
                    icon="close"
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
                        : setDeleting(category)
                    }
                  />
                </div>
              ) : null}
            </div>
            {isRenaming && error ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {error}
              </div>
            ) : null}

            <div
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2] }}
            >
              {category.subcategories.map((name) => {
                const count = productsInSubcategory(products, category.name, name);
                return pill(
                  <>
                    {name}
                    <span style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
                      {count}
                    </span>
                    {count === 0 ? (
                      <button
                        type="button"
                        aria-label={`Remove ${name}`}
                        onClick={() => {
                          removeSubcategory(category.id, name);
                          void reload();
                        }}
                        style={{
                          display: "inline-flex",
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: colors.inkMuted,
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    ) : null}
                  </>,
                  name,
                );
              })}

              {isAdding ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: spacing[2] }}>
                  <span style={{ width: 200 }}>
                    <Input
                      autoFocus
                      autoComplete="off"
                      placeholder="Subcategory name"
                      aria-label="New subcategory name"
                      value={addingSubTo.name}
                      aria-invalid={error ? true : undefined}
                      style={{ height: 36 }}
                      onChange={(event) => {
                        setAddingSubTo({ id: category.id, name: event.target.value });
                        setError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveSub(category);
                        if (event.key === "Escape") setAddingSubTo(null);
                      }}
                    />
                  </span>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => saveSub(category)}
                    style={{ height: 36 }}
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
                    style={{ height: 36 }}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingSubTo({ id: category.id, name: "" });
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
              )}
            </div>
            {isAdding && error ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {error}
              </div>
            ) : null}
          </Card>
        );
      })}

      <Modal open={deleting !== null} onClose={() => setDeleting(null)}>
        <div style={{ width: 420, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Delete {deleting?.name}?</div>
          <p
            style={{ ...textStyle("body"), color: colors.inkMuted, margin: `${spacing[3]}px 0 0` }}
          >
            No products use this category, so nothing else changes. Its subcategories are removed
            with it.
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
                if (deleting) deleteCategory(deleting.id);
                setDeleting(null);
                void reload();
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
