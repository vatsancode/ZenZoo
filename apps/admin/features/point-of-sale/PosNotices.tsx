"use client";

import { useTheme } from "@zenzoo/design-tokens";
import { textStyle } from "@zenzoo/ui-web";

interface PosNoticesProps {
  loadError: string | null;
  /** What changed in the cart when prices or stock moved on, or null when nothing did. */
  changes: string[] | null;
  onDismissChanges: () => void;
}

/** The warnings a till shows above the cart: the catalogue didn't load, or the bill changed under the cashier. */
export default function PosNotices({ loadError, changes, onDismissChanges }: PosNoticesProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <>
      {loadError ? (
        <div role="alert" style={{ ...textStyle("callout"), color: colors.danger }}>
          {loadError}
        </div>
      ) : null}
      {changes ? (
        <div
          role="alert"
          style={{
            ...textStyle("callout"),
            color: colors.ink,
            backgroundColor: colors.surfaceSunken,
            border: `1px solid ${colors.warning}`,
            borderRadius: radius.md,
            padding: spacing[4],
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: spacing[4],
          }}
        >
          <div>
            <div style={{ ...textStyle("bodyMedium"), color: colors.warning }}>
              The bill changed while it was open
            </div>
            <ul style={{ margin: `${spacing[2]}px 0 0`, paddingLeft: spacing[5] }}>
              {changes.length > 0 ? (
                changes.map((change) => <li key={change}>{change}</li>)
              ) : (
                <li>Prices or stock were updated.</li>
              )}
            </ul>
            <div
              style={{ ...textStyle("footnote"), color: colors.inkMuted, marginTop: spacing[2] }}
            >
              The cart now shows the current prices. Check the total, then complete the sale.
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissChanges}
            style={{
              ...textStyle("callout"),
              border: "none",
              background: "transparent",
              color: colors.inkMuted,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );
}
