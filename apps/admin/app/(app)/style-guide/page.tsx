"use client";

import {
  colorGroups,
  sampleLineItems,
  sampleProduct,
  textStyleOrder,
  typeSampleLine,
  useTheme,
} from "@zenzoo/design-tokens";
import { Badge, Button, Card, Input, Modal, Select, Table, textStyle } from "@zenzoo/ui-web";
import { useState, type ReactNode } from "react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <section style={{ marginBottom: spacing[12] }}>
      <h2 style={{ ...textStyle("title1"), color: colors.ink, marginBottom: spacing[6] }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ColorSwatch({ name, value }: { name: string; value: string }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <div style={{ width: 140 }}>
      <div
        style={{
          height: 64,
          borderRadius: radius.lg,
          backgroundColor: value,
          border: `1px solid ${colors.border}`,
        }}
      />
      <div style={{ ...textStyle("footnote"), color: colors.ink, marginTop: spacing[2] }}>
        {name}
      </div>
      <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>{value}</div>
    </div>
  );
}

export default function StyleGuidePage() {
  const { colors, radius, spacing, elevation } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main style={{ padding: spacing[10], maxWidth: 960, marginInline: "auto" }}>
      <h1 style={{ ...textStyle("display"), color: colors.ink, marginBottom: spacing[2] }}>
        ZenZoo style guide
      </h1>
      <p style={{ ...textStyle("callout"), color: colors.inkMuted, marginBottom: spacing[12] }}>
        Every token and component below is read live from <code>@zenzoo/design-tokens</code> and{" "}
        <code>@zenzoo/ui-web</code> - this page can&apos;t drift from the real system.
      </p>

      <Section title="Color">
        {colorGroups.map((group) => (
          <div key={group.title} style={{ marginBottom: spacing[6] }}>
            <div
              style={{ ...textStyle("caption"), color: colors.inkMuted, marginBottom: spacing[3] }}
            >
              {group.title.toUpperCase()}
            </div>
            <div style={{ display: "flex", gap: spacing[4], flexWrap: "wrap" }}>
              {group.keys.map((key) => (
                <ColorSwatch key={key} name={key} value={colors[key]} />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Typography">
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
          {textStyleOrder.map((name) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: spacing[6],
                borderBottom: `1px solid ${colors.border}`,
                paddingBottom: spacing[3],
              }}
            >
              <div
                style={{
                  ...textStyle("dataSmall"),
                  color: colors.inkMuted,
                  width: 90,
                  flex: "none",
                }}
              >
                {name}
              </div>
              <div style={{ ...textStyle(name), color: colors.ink }}>{typeSampleLine}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Spacing">
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
          {Object.entries(spacing).map(([key, value]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: spacing[4] }}>
              <div style={{ ...textStyle("dataSmall"), color: colors.inkMuted, width: 80 }}>
                space-{key} ({value}px)
              </div>
              <div
                style={{
                  height: 16,
                  width: value,
                  backgroundColor: colors.accent,
                  borderRadius: radius.sm,
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius">
        <div style={{ display: "flex", gap: spacing[6], flexWrap: "wrap" }}>
          {Object.entries(radius).map(([key, value]) => (
            <div key={key} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: value,
                  backgroundColor: colors.surfaceSunken,
                  border: `1px solid ${colors.border}`,
                }}
              />
              <div
                style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[2] }}
              >
                {key}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation">
        <div style={{ display: "flex", gap: spacing[8], flexWrap: "wrap" }}>
          {Object.entries(elevation).map(([key, level]) => (
            <div key={key} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 96,
                  height: 64,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceRaised,
                  boxShadow: level.web,
                }}
              />
              <div
                style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[3] }}
              >
                shadow-{key}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Button">
        <div style={{ display: "flex", gap: spacing[3], flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="primary">Charge $48.50</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger">Void sale</Button>
          <Button variant="primary" disabled>
            Charge $48.50
          </Button>
        </div>
      </Section>

      <Section title="Input & Select">
        <div style={{ display: "flex", gap: spacing[5], flexWrap: "wrap" }}>
          <div style={{ width: 220 }}>
            <Input placeholder={sampleProduct.name} />
          </div>
          <div style={{ width: 220 }}>
            <Input defaultValue="-3" aria-invalid />
          </div>
          <div style={{ width: 220 }}>
            <Input defaultValue={sampleProduct.sku} disabled />
          </div>
          <div style={{ width: 220 }}>
            <Select defaultValue="beverages">
              <option value="beverages">Beverages</option>
              <option value="bakery">Bakery</option>
              <option value="produce">Produce</option>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Badge">
        <div style={{ display: "flex", gap: spacing[3], flexWrap: "wrap" }}>
          <Badge>Draft</Badge>
          <Badge tone="success">In stock</Badge>
          <Badge tone="warning">Low stock</Badge>
          <Badge tone="danger">Out of stock</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card style={{ maxWidth: 280 }}>
          <div style={{ ...textStyle("title3"), color: colors.ink }}>{sampleProduct.name}</div>
          <div style={{ ...textStyle("callout"), color: colors.inkMuted, marginTop: spacing[1] }}>
            {sampleProduct.description}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: spacing[4],
              alignItems: "baseline",
            }}
          >
            <span style={{ ...textStyle("dataSmall"), color: colors.inkMuted }}>
              {sampleProduct.sku}
            </span>
            <span style={{ ...textStyle("data"), color: colors.ink }}>{sampleProduct.price}</span>
          </div>
        </Card>
      </Section>

      <Section title="Table">
        <Table
          getRowKey={(row) => row.sku}
          columns={[
            { key: "item", header: "Item", render: (row) => row.item },
            { key: "sku", header: "SKU", render: (row) => row.sku },
            { key: "qty", header: "Qty", align: "right", render: (row) => row.qty },
            { key: "total", header: "Total", align: "right", render: (row) => row.total },
          ]}
          rows={sampleLineItems}
        />
      </Section>

      <Section title="Modal">
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Void this sale
        </Button>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
          <div style={{ ...textStyle("title2"), color: colors.ink }}>Void this sale?</div>
          <p style={{ ...textStyle("callout"), color: colors.inkMuted, marginTop: spacing[2] }}>
            This removes all 3 items from the current sale. This can&apos;t be undone.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: spacing[3],
              marginTop: spacing[6],
            }}
          >
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Keep sale
            </Button>
            <Button variant="danger" onClick={() => setModalOpen(false)}>
              Void sale
            </Button>
          </div>
        </Modal>
      </Section>
    </main>
  );
}
