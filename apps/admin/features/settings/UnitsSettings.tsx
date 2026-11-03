"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Icon,
  IconButton,
  Input,
  Modal,
  Switch,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { useAccess } from "../../lib/access";
import { NAME_MAX } from "../../lib/text";
import { useListOrder } from "../../lib/useListOrder";
import { useSingleFlight } from "../../lib/useSingleFlight";
import {
  addUnit,
  deleteUnit,
  listUnits,
  reorderUnits,
  resetUnitOrder,
  setUnitEnabled,
  updateUnit,
  type Unit,
} from "./units";
import FormField from "../../components/FormField";
import MoveButtons from "../../components/MoveButtons";
import PageHeader from "../../components/PageHeader";

/** The units quantities are counted in. Switching one off keeps its history but stops offering it on new products. */
export default function UnitsSettings() {
  const { colors, spacing } = useTheme();
  const { can } = useAccess();
  const canEdit = can("settings", "edit");
  const canDelete = can("settings", "delete");
  const [deleting, setDeleting] = useState<Unit | null>(null);
  const removal = useSingleFlight();
  const renameSave = useSingleFlight();
  const [renaming, setRenaming] = useState<Unit | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameCode, setRenameCode] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [decimals, setDecimals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { busy: saving, run } = useSingleFlight();

  async function reload() {
    setUnits(await listUnits());
  }

  const order = useListOrder({
    enabled: canEdit,
    items: units,
    setItems: setUnits,
    reload,
    save: reorderUnits,
    reset: resetUnitOrder,
    notify: setMessage,
  });
  const hasOwnOrder = units.some((unit) => unit.sortOrder !== null);

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  function close() {
    setOpen(false);
    setCode("");
    setName("");
    setDecimals(false);
    setError(null);
  }

  function submit() {
    return run(async () => {
      const result = await addUnit(code, name, decimals);
      if (typeof result === "string") {
        setError(result);
        return;
      }
      setMessage(`${result.name} added.`);
      close();
      void reload();
    });
  }

  function openRename(unit: Unit) {
    setRenaming(unit);
    setRenameName(unit.name);
    setRenameCode(unit.code);
    setRenameError(null);
  }

  function submitRename() {
    return renameSave.run(async () => {
      if (!renaming) return;
      const unit = renaming;
      if (renameCode.trim() === "") {
        setRenameError("Enter a short code, like doz.");
        return;
      }
      if (renameName.trim() === "") {
        setRenameError("Enter the unit's name, like Dozen.");
        return;
      }
      const problem = await updateUnit(unit, renameName, renameCode);
      if (problem) {
        setRenameError(problem);
        // A stale screen (another tab deleted it) is the likely reason, so refresh the list too.
        void reload();
        return;
      }
      setRenaming(null);
      setMessage(`${unit.name} updated.`);
      void reload();
    });
  }

  function confirmDelete() {
    return removal.run(async () => {
      if (!deleting) return;
      const unit = deleting;
      const result = await deleteUnit(unit);
      setDeleting(null);
      setMessage(result ?? `${unit.name} deleted.`);
      void reload();
    });
  }

  async function toggle(unit: Unit, enabled: boolean) {
    const result = await setUnitEnabled(unit.id, enabled);
    if (result) {
      setMessage(result);
      return;
    }
    setMessage(
      enabled
        ? `${unit.name} is on again.`
        : `${unit.name} is off. It no longer shows when adding a product; existing products keep it.`,
    );
    void reload();
  }

  const columns: TableColumn<Unit>[] = [
    ...(canEdit
      ? [
          {
            key: "order",
            header: "",
            width: "136px",
            render: (unit: Unit) => (
              <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    color: colors.inkMuted,
                    cursor: order.ordering ? "not-allowed" : "grab",
                  }}
                >
                  <Icon name="grip" />
                </span>
                <MoveButtons
                  name={unit.name}
                  index={units.findIndex((other) => other.id === unit.id)}
                  count={units.length}
                  disabled={order.ordering}
                  onMove={(toIndex) => void order.move(unit.id, toIndex)}
                />
              </div>
            ),
          },
        ]
      : []),
    {
      key: "code",
      header: "Unit",
      width: "14%",
      render: (unit) => <span style={textStyle("data")}>{unit.code}</span>,
    },
    {
      key: "name",
      header: "Name",
      render: (unit) => (
        <span
          style={{
            color: unit.status === "active" ? colors.ink : colors.inkMuted,
            overflowWrap: "anywhere",
          }}
        >
          {unit.name}
          {unit.status === "disabled" ? (
            <span style={{ marginLeft: spacing[3] }}>
              <Badge tone="neutral">Disabled</Badge>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "decimals",
      header: "Quantities",
      render: (unit) => (unit.allowDecimals ? "Can have decimals" : "Whole numbers only"),
    },
    {
      key: "status",
      header: "",
      align: "right",
      width: "160px",
      render: (unit) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: spacing[2] }}>
          {canEdit ? (
            <IconButton icon="edit" label={`Edit ${unit.name}`} onClick={() => openRename(unit)} />
          ) : null}
          {canDelete && !unit.permanent ? (
            <IconButton
              icon="trash"
              label={`Delete ${unit.name}`}
              onClick={() => setDeleting(unit)}
            />
          ) : null}
          <Switch
            disabled={!canEdit}
            checked={unit.status === "active"}
            aria-label={unit.status === "active" ? `Turn ${unit.name} off` : `Turn ${unit.name} on`}
            onChange={(next) => void toggle(unit, next)}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Units"
        subtitle="How quantities are counted across stock, purchases and sales."
        backHref="/settings"
        backLabel="Back to settings"
        action={
          canEdit ? (
            <Button type="button" variant="primary" onClick={() => setOpen(true)}>
              Add unit
            </Button>
          ) : undefined
        }
      />

      {message ? (
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{message}</div>
      ) : null}

      <Table
        columns={columns}
        rows={units}
        getRowKey={(unit) => unit.id}
        rowProps={(unit, index) => ({
          ...order.rowProps(unit.id, index),
          style: {
            opacity: order.dragId === unit.id ? 0.5 : 1,
            backgroundColor:
              order.overId === unit.id && order.dragId !== unit.id
                ? colors.surfaceSunken
                : undefined,
          },
        })}
      />

      {canEdit ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: spacing[4],
          }}
        >
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
            Drag a row, or use the arrows, to change the order. It applies when adding or editing a
            product.
          </div>
          {hasOwnOrder ? (
            <Button
              type="button"
              variant="secondary"
              disabled={order.ordering}
              onClick={() => void order.resetOrder()}
            >
              Reset to A to Z
            </Button>
          ) : null}
        </div>
      ) : null}

      <Modal open={renaming !== null} onClose={() => setRenaming(null)}>
        <form
          style={{ width: 460, maxWidth: "100%" }}
          onSubmit={(event) => {
            event.preventDefault();
            void submitRename();
          }}
        >
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Edit unit</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            Products keep using this unit, whatever its code or name becomes.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "140px minmax(0, 1fr)",
              columnGap: spacing[4],
              alignItems: "start",
              marginTop: spacing[5],
            }}
          >
            <FormField id="unit-edit-code" label="SHORT CODE" span={1}>
              <Input
                id="unit-edit-code"
                autoFocus
                autoComplete="off"
                maxLength={10}
                value={renameCode}
                aria-invalid={renameError ? true : undefined}
                onChange={(event) => {
                  setRenameCode(event.target.value);
                  setRenameError(null);
                }}
              />
            </FormField>
            <FormField id="unit-edit-name" label="NAME" span={1}>
              <Input
                id="unit-edit-name"
                autoComplete="off"
                maxLength={NAME_MAX}
                value={renameName}
                aria-invalid={renameError ? true : undefined}
                onChange={(event) => {
                  setRenameName(event.target.value);
                  setRenameError(null);
                }}
              />
            </FormField>
          </div>
          {renameError ? (
            <div
              role="alert"
              style={{ ...textStyle("footnote"), color: colors.danger, marginTop: spacing[3] }}
            >
              {renameError}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button type="button" variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={renameSave.busy}>
              Save changes
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
            If a product uses this unit, it can't be deleted. Switch it off instead.
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
              loading={removal.busy}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={open} onClose={close}>
        <div style={{ width: 460, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Add unit</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            It becomes available when you add or edit a product.
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing[6],
              marginTop: spacing[6],
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px minmax(0, 1fr)",
                columnGap: spacing[4],
                alignItems: "start",
              }}
            >
              <FormField id="unit-code" label="SHORT CODE" span={1}>
                <Input
                  id="unit-code"
                  autoFocus
                  autoComplete="off"
                  placeholder="doz"
                  maxLength={10}
                  value={code}
                  disabled={saving}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setError(null);
                  }}
                />
              </FormField>
              <FormField id="unit-name" label="NAME" span={1}>
                <Input
                  id="unit-name"
                  autoComplete="off"
                  placeholder="Dozen"
                  maxLength={NAME_MAX}
                  value={name}
                  disabled={saving}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                />
              </FormField>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing[4],
              }}
            >
              <label htmlFor="unit-decimals" style={{ ...textStyle("body"), color: colors.ink }}>
                Allow decimals
                <span
                  style={{ ...textStyle("footnote"), color: colors.inkMuted, display: "block" }}
                >
                  Turn on for things sold by weight or volume, like 1.5.
                </span>
              </label>
              <Switch id="unit-decimals" checked={decimals} onChange={setDecimals} />
            </div>
            {error ? (
              <div role="alert" style={{ ...textStyle("footnote"), color: colors.danger }}>
                {error}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing[3] }}>
              <Button type="button" variant="secondary" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Add unit
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
