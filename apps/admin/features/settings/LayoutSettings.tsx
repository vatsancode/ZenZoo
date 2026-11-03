"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Card, Select, textStyle } from "@zenzoo/ui-web";
import PageHeader from "../../components/PageHeader";
import { LAYOUT_AREAS, useLayout, type LayoutArea } from "../../lib/layouts";

function LayoutRow({ area, first }: { area: LayoutArea; first: boolean }) {
  const { colors, spacing } = useTheme();
  const [layout, setLayout] = useLayout(area.key);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing[4],
        minHeight: 76,
        borderTop: first ? "none" : `1px solid ${colors.border}`,
      }}
    >
      <label htmlFor={`layout-${area.key}`} style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...textStyle("bodyMedium"), color: colors.ink }}>{area.name}</div>
        <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>{area.description}</div>
      </label>
      <div style={{ width: 220, flexShrink: 0 }}>
        <Select
          id={`layout-${area.key}`}
          aria-label={area.name}
          searchable={false}
          value={layout}
          options={area.options.map((option) => ({ value: option.id, label: option.name }))}
          onChange={setLayout}
        />
      </div>
    </div>
  );
}

/** One row per screen that has more than one layout, each with a dropdown to pick between them. */
export default function LayoutSettings() {
  const { colors, spacing } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[6] }}>
      <PageHeader
        title="Layout"
        subtitle="Choose how screens are arranged."
        backHref="/settings"
        backLabel="Back to settings"
      />

      <Card style={{ padding: `${spacing[2]}px ${spacing[6]}px` }}>
        {LAYOUT_AREAS.map((area, index) => (
          <LayoutRow key={area.key} area={area} first={index === 0} />
        ))}
      </Card>

      <div style={{ ...textStyle("footnote"), color: colors.inkMuted }}>
        The choice is remembered on this device and applies the next time the screen opens.
      </div>
    </div>
  );
}
