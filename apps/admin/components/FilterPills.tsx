"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { Icon, textStyle } from "@zenzoo/ui-web";

export interface FilterGroup {
  key: string;
  /** What is being filtered, e.g. "Category". */
  label: string;
  /** What is picked. Long lists are shortened to the first two and a count. */
  values: string[];
  /** Drops the whole group. */
  onClear: () => void;
}

interface FilterPillsProps {
  groups: FilterGroup[];
  /** Opens the filter panel, so a pill can be clicked to change it. */
  onEdit: () => void;
  onClearAll: () => void;
}

const SHOWN = 2;

/** What is active as one pill per filter, however many values it holds: "Category · Rent, Salaries +7". */
export default function FilterPills({ groups, onEdit, onClearAll }: FilterPillsProps) {
  const { colors, radius, spacing } = useTheme();
  if (groups.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2] }}>
      {groups.map((group) => {
        const extra = group.values.length - SHOWN;
        const summary = `${group.values.slice(0, SHOWN).join(", ")}${extra > 0 ? ` +${extra}` : ""}`;
        return (
          <span
            key={group.key}
            style={{
              display: "inline-flex",
              height: 36,
              boxSizing: "border-box",
              alignItems: "stretch",
              border: `1px solid ${colors.border}`,
              borderRadius: radius.full,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              title={group.values.join(", ")}
              aria-label={`${group.label}: ${group.values.join(", ")}. Change`}
              onClick={onEdit}
              style={{
                ...textStyle("callout"),
                display: "inline-flex",
                alignItems: "center",
                whiteSpace: "nowrap",
                gap: spacing[2],
                height: "100%",
                paddingLeft: spacing[4],
                paddingRight: spacing[2],
                border: "none",
                background: "transparent",
                color: colors.ink,
                cursor: "pointer",
              }}
            >
              <span style={{ color: colors.inkMuted }}>{group.label}</span>
              <span>{summary}</span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${group.label} filter`}
              onClick={group.onClear}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "100%",
                paddingLeft: spacing[1],
                paddingRight: spacing[3],
                border: "none",
                background: "transparent",
                color: colors.inkMuted,
                cursor: "pointer",
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={onClearAll}
        style={{
          ...textStyle("bodyMedium"),
          padding: `0 ${spacing[2]}px`,
          border: "none",
          background: "transparent",
          color: colors.inkMuted,
          cursor: "pointer",
        }}
      >
        Clear all
      </button>
    </div>
  );
}
