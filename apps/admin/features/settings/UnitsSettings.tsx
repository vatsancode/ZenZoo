"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Badge, Button, Input, Modal, Switch, Table, textStyle, type TableColumn } from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import { addUnit, listUnits, setUnitEnabled, type Unit } from "./units";
import FormField from "../../components/FormField";
import PageHeader from "../../components/PageHeader";

/** The units quantities are counted in. Switching one off keeps its history but stops offering it on new products. */
export default function UnitsSettings() {
  const { colors, spacing } = useTheme();
  const [units, setUnits] = useState<Unit[]>([]);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [decimals, setDecimals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setUnits(await listUnits());
  }

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

  async function submit() {
    setSaving(true);
    const result = await addUnit(code, name, decimals);
    setSaving(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setMessage(`${result.name} added.`);
    close();
    void reload();
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
        <span style={{ color: unit.status === "active" ? colors.ink : colors.inkMuted }}>
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
      width: "80px",
      render: (unit) => (
        <Switch
          checked={unit.status === "active"}
          aria-label={unit.status === "active" ? `Turn ${unit.name} off` : `Turn ${unit.name} on`}
          onChange={(next) => void toggle(unit, next)}
        />
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
          <Button type="button" variant="primary" onClick={() => setOpen(true)}>
            Add unit
          </Button>
        }
      />

      {message ? (
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{message}</div>
      ) : null}

      <Table columns={columns} rows={units} getRowKey={(unit) => unit.id} />

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
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Adding..." : "Add unit"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
