"use client";

import { useTheme } from "@zenzoo/design-tokens";
import {
  Badge,
  Button,
  Input,
  Modal,
  Switch,
  Table,
  textStyle,
  type TableColumn,
} from "@zenzoo/ui-web";
import { useEffect, useState } from "react";
import {
  addUnit,
  listUnits,
  productsUsingUnit,
  removeUnit,
  type UnitDef,
} from "../../lib/catalogue";
import { listProducts, type Product } from "../stocks/stocks";
import FormField from "../../components/FormField";
import PageHeader from "../../components/PageHeader";

/** The units quantities are counted in. The built-in ones stay; you can add your own. */
export default function UnitsSettings() {
  const { colors, spacing } = useTheme();
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [decimals, setDecimals] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setUnits([...(await listUnits())]);
    setProducts([...(await listProducts())]);
  }

  useEffect(() => {
    void reload();
  }, []);

  function close() {
    setOpen(false);
    setCode("");
    setName("");
    setDecimals(false);
    setError(null);
  }

  function submit() {
    const message = addUnit(code, name, decimals);
    if (message) {
      setError(message);
      return;
    }
    close();
    void reload();
  }

  const columns: TableColumn<UnitDef>[] = [
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
        <span>
          {unit.name}
          {unit.builtin ? (
            <span style={{ marginLeft: spacing[3] }}>
              <Badge tone="neutral">Built in</Badge>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "decimals",
      header: "Quantities",
      render: (unit) => (unit.decimals ? "Can have decimals" : "Whole numbers only"),
    },
    {
      key: "used",
      header: "Used by",
      render: (unit) => {
        const used = productsUsingUnit(products, unit.code);
        return (
          <span style={{ color: used > 0 ? colors.ink : colors.inkMuted }}>
            {used} {used === 1 ? "item" : "items"}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "120px",
      render: (unit) =>
        !unit.builtin && productsUsingUnit(products, unit.code) === 0 ? (
          <button
            type="button"
            onClick={() => {
              removeUnit(unit.code);
              void reload();
            }}
            style={{
              ...textStyle("bodyMedium"),
              padding: 0,
              border: "none",
              background: "transparent",
              color: colors.inkMuted,
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        ) : null,
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

      <Table columns={columns} rows={units} getRowKey={(unit) => unit.code} />

      <Modal open={open} onClose={close}>
        <div style={{ width: 460, maxWidth: "100%" }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>Add unit</div>
          <div style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[1] }}>
            It becomes available when you add or edit a product.
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
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
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Add unit
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
